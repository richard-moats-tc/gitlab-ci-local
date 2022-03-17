import chalk from "chalk";
import deepExtend from "deep-extend";
import {Utils} from "./utils";
import {assert} from "./asserts";
import {Job} from "./job";
import {Service} from "./service";
import { ParseContext } from "./parser";

const extendsMaxDepth = 11;
const extendsRecurse = (pCtx: ParseContext, gitlabData: any, jobName: string, jobData: any, parents: any[], depth: number) => {
    pCtx.assert(depth < extendsMaxDepth, "circular dependency detected in `extends`");
    depth++;
    pCtx.in("extends").call(pCtx => {
        for (const parentName of (jobData.extends || [])) {
            pCtx.resolving(parentName).call(pCtx => {
                const parentData = gitlabData[parentName];
                pCtx.assert(parentData != null, "parent job could not be resolved");
                extendsRecurse(pCtx, gitlabData, parentName, parentData, parents, depth);
                parents.push(parentData);
            });
        }
    });
    return parents;
};

export function jobExtends(pCtx: ParseContext, gitlabData: any) {
    for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
        if (Job.illegalJobNames.includes(jobName)) continue;
        if (typeof jobData !== "object") continue;

        pCtx.in(jobName).in("extends").call(_ => {
            jobData.extends = typeof jobData.extends === "string" ? [jobData.extends] : jobData.extends ?? [];
        });
    }

    Utils.forEachRealJob(pCtx, gitlabData, (pCtx, jobName, jobData) => {
        const parentDatas = extendsRecurse(pCtx, gitlabData, jobName, jobData, [], 0);
        gitlabData[jobName] = deepExtend({}, ...parentDatas, jobData);
    });

    for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
        if (Job.illegalJobNames.includes(jobName)) continue;
        delete jobData.extends;
    }
}

export function reference(pCtx: ParseContext, gitlabData: any, recurseData: any) {
    for (const [key, value] of Object.entries<any>(recurseData || {})) {
        if (value?.referenceData) {
            pCtx.resolving(key, value.referenceData).call(pCtx => {
                recurseData[key] = getSubDataByReference(pCtx, gitlabData, value.referenceData);
                if (Array.isArray(recurseData[key]) && recurseData[key].filter((d: any) => Array.isArray(d)).length > 0) {
                    recurseData[key] = expandMultidimension(pCtx, recurseData[key]);
                }
            });
        } else if (typeof value === "object") {
            reference(pCtx.in(key), gitlabData, value);
        }
    }
}

const getSubDataByReference = (pCtx: ParseContext, gitlabData: any, referenceData: string[]) => {
    let gitlabSubData = gitlabData;
    referenceData.forEach((referencePointer) => {
        pCtx.required(referencePointer, "undefined reference pointer");
        gitlabSubData = gitlabSubData[referencePointer];
        pCtx.required(gitlabSubData, `undefined reference value: ${referencePointer}`);
    });
    return gitlabSubData;
};

export function artifacts(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (_pCtx, _jobName, jobData) => {
        const expandedArtifacts = jobData.artifacts || (gitlabData.default || {}).artifacts || gitlabData.artifacts;
        if (expandedArtifacts) {
            jobData.artifacts = expandedArtifacts;
        }
    });
}

export function services(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (_pCtx, _, jobData) => {
        const expandedServices = jobData.services || (gitlabData.default || {}).services || gitlabData.services;
        if (expandedServices) {
            jobData.services = [];
            for (const [index, expandedService] of Object.entries<any>(expandedServices)) {
                jobData.services[index] = new Service({
                    name: typeof expandedService === "string" ? expandedService : expandedService.name,
                    entrypoint: expandedService.entrypoint,
                    command: expandedService.command,
                    alias: expandedService.alias,
                });
            }
        }
    });
}

export function image(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (_pCtx, _jobName, jobData) => {
        const expandedImage = jobData.image || (gitlabData.default || {}).image || gitlabData.image;
        if (expandedImage) {
            jobData.image = {
                name: typeof expandedImage === "string" ? expandedImage : expandedImage.name,
                entrypoint: expandedImage.entrypoint,
            };
        }
    });
}

// console.log(`jobExtends(${JSON.stringify(gitlabData)})`)
// console.log(`${jobName} -- jobExtends(${JSON.stringify(jobData)})`);

const expandMultidimension = (pCtx: ParseContext, inputArr: (string | string[])[]) => {
    const arr: string[] = [];
    for (const line of inputArr) {
        pCtx.required(line, "undefined entry in expansion array");
        if (typeof line == "string") {
            arr.push(line);
        } else {
            line.forEach((l: string) => arr.push(l));
        }
    }
    return arr;
};

export function beforeScripts(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (pCtx, job, jobData) => {
        const expandedBeforeScripts = [].concat(jobData.before_script || (gitlabData.default || {}).before_script || gitlabData.before_script || []);
        if (expandedBeforeScripts.length > 0) {
            jobData.before_script = expandMultidimension(pCtx.in("before_script"), expandedBeforeScripts);
        }
    });
}

export function afterScripts(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (pCtx, _, jobData) => {
        const expandedAfterScripts = [].concat(jobData.after_script || (gitlabData.default || {}).after_script || gitlabData.after_script || []);
        if (expandedAfterScripts.length > 0) {
            jobData.after_script = expandMultidimension(pCtx.in("after_script"), expandedAfterScripts);
        }
    });
}

export function scripts(pCtx: ParseContext, gitlabData: any) {
    Utils.forEachRealJob(pCtx, gitlabData, (pCtx, jobName, jobData) => {
        pCtx.assert(jobData.script || jobData.trigger, "job must have script specified");
        jobData.script = typeof jobData.script === "string" ? [jobData.script] : jobData.script;
        if (jobData.script) {
            jobData.script = expandMultidimension(pCtx.in("script"), jobData.script);
        }
    });
}
