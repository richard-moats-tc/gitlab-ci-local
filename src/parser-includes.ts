import {Utils} from "./utils";
import {ExitError} from "./types/exit-error";
import * as fs from "fs-extra";
import {WriteStreams} from "./types/write-streams";
import {GitData} from "./git-data";
import {assert} from "./asserts";
import chalk from "chalk";
import {Parser} from "./parser";
import axios from "axios";
import { string } from "yargs";

export class ParserIncludes {
    static readonly localStorage = ".gitlab-ci-local";
    static readonly localIncludes = `${this.localStorage}/includes`;

    static async init(gitlabData: any, cwd: string, writeStreams: WriteStreams, gitData: GitData, depth: number, fetchIncludes: boolean, localProjects: { [key: string]: string }): Promise<any[]> {
        let includeDatas: any[] = [];
        const promises = [];

        assert(depth < 100, chalk`circular dependency detected in \`include\``);
        depth++;

        const include = this.expandInclude(gitlabData["include"]);
        const includedProjects = new Set();

        // Find files to fetch from remote and place in ${this.localIncludes}
        for (const value of include) {
            if (value["local"]) {
                const fileExists = fs.existsSync(`${cwd}/${value["local"]}`);
                if (!fileExists) {
                    throw new ExitError(`Local include file cannot be found ${value["local"]}`);
                }
            } else if (value["file"]) {
                for (const fileValue of Array.isArray(value["file"]) ? value["file"] : [value["file"]]) {
                    const key = value["project"] + "|" + (value["ref"] || gitData.remote.default_branch);
                    if (!includedProjects.has(key)) {
                        includedProjects.add(key);
                        promises.push(this.ensureIncludeProjectFile(cwd, value["project"], value["ref"]
                        || gitData.remote.default_branch, fileValue, gitData, fetchIncludes, localProjects));
                    }
                }
            } else if (value["template"]) {
                const {project, ref, file, domain} = this.covertTemplateToProjectFile(value["template"]);
                const url = `https://${domain}/${project}/-/raw/${ref}/${file}`;
                promises.push(this.downloadIncludeRemote(cwd, url, fetchIncludes));
            } else if (value["remote"]) {
                promises.push(this.downloadIncludeRemote(cwd, value["remote"], fetchIncludes));
            }

        }

        await Promise.all(promises);

        for (const value of include) {
            if (value["local"]) {
                const localDoc = await Parser.loadYaml(`${cwd}/${value.local}`);
                includeDatas = includeDatas.concat(await this.init(localDoc, cwd, writeStreams, gitData, depth, fetchIncludes, localProjects));
            } else if (value["project"]) {
                for (const fileValue of Array.isArray(value["file"]) ? value["file"] : [value["file"]]) {
                    const fileDoc = await Parser.loadYaml(`${cwd}/${this.localIncludes}/${gitData.remote.host}/${value["project"]}/${value["ref"] || gitData.remote.default_branch}/${fileValue}`);
                    // Expand local includes inside a "project"-like include
                    this.expandInclude(fileDoc["include"]).forEach((inner: any, i: number) => {
                        if (!inner["local"]) return;
                        fileDoc["include"][i] = {
                            project: value["project"],
                            file: inner["local"].replace(/^\//, ""),
                            ref: value["ref"],
                        };
                    });

                    includeDatas = includeDatas.concat(await this.init(fileDoc, cwd, writeStreams, gitData, depth, fetchIncludes, localProjects));
                }
            } else if (value["template"]) {
                const {project, ref, file, domain} = this.covertTemplateToProjectFile(value["template"]);
                const fsUrl = Utils.fsUrl(`https://${domain}/${project}/-/raw/${ref}/${file}`);
                const fileDoc = await Parser.loadYaml(`${cwd}/${this.localIncludes}/${fsUrl}`);
                includeDatas = includeDatas.concat(await this.init(fileDoc, cwd, writeStreams, gitData, depth, fetchIncludes, localProjects));
            } else if (value["remote"]) {
                const fsUrl = Utils.fsUrl(value["remote"]);
                const fileDoc = await Parser.loadYaml(`${cwd}/${this.localIncludes}/${fsUrl}`);
                includeDatas = includeDatas.concat(await this.init(fileDoc, cwd, writeStreams, gitData, depth, fetchIncludes, localProjects));
            } else {
                throw new ExitError(`Didn't understand include ${JSON.stringify(value)}`);
            }
        }

        includeDatas.push(gitlabData);
        return includeDatas;
    }

    static expandInclude(i: any): any[] {
        let include = i || [];
        if (include && include.length == null) {
            include = [ i ];
        }
        if (typeof include === "string") {
            include = [include];
        }
        for (const [index, entry] of Object.entries(include)) {
            if (typeof entry === "string" && (entry.startsWith("https:") || entry.startsWith("http:"))) {
                include[index] = {"remote": entry};
            } else if (typeof entry === "string") {
                include[index] = {"local": entry };
            } else {
                include[index] = entry;
            }

        }
        return include;
    }

    static covertTemplateToProjectFile(template: string): { project: string; ref: string; file: string; domain: string } {
        return {
            domain: "gitlab.com",
            project: "gitlab-org/gitlab",
            ref: "master",
            file: `lib/gitlab/ci/templates/${template}`,
        };
    }

    static async downloadIncludeRemote(cwd: string, url: string, fetchIncludes: boolean): Promise<void> {
        const fsUrl = Utils.fsUrl(url);
        try {
            const target = `${cwd}/${this.localIncludes}/${fsUrl}`;
            if (await fs.pathExists(target) && !fetchIncludes) return;
            const res = await axios.get(url);
            return fs.outputFile(target, res.data);
        } catch (e) {
            throw new ExitError(`Remote include could not be fetched ${url} ${e}`);
        }
    }

    static async ensureIncludeProjectFile(cwd: string, project: string, ref: string, file: string, gitData: GitData, fetchIncludes: boolean, localProjects: { [key: string]: string }): Promise<void> {
        const remote = gitData.remote;
        const normalizedFile = file.replace(/^\/+/, "");
        const projectDir = `${cwd}/${this.localIncludes}/${remote.host}/${project}`;
        const refDir = `${projectDir}/${ref}`;

        return fs.pathExists(`${refDir}/${normalizedFile}`)
            .then(exists => !exists || fetchIncludes)
            .then(fetch => {
                if (fetch) {
                    return fs.pathExists(refDir)
                        .then(exists => {
                            if (exists) {
                                return fs.lstat(refDir)
                                    .then(stat => { if (stat.isSymbolicLink()) return fs.unlink(refDir); });
                            }
                        }).then(() => {
                                const localPath = localProjects[project];
                                if (localPath) {
                                    return fs.ensureDir(projectDir)
                                        .then(( ) => fs.symlink(localPath, refDir));
                                } else {
                                    return this.downloadIncludeProjectFile(cwd, project, ref, file, refDir, gitData);
                                }
                            });
                        }
                    });
    }

    static async downloadIncludeProjectFile(cwd: string, project: string, ref: string, file: string, target: string, gitData: GitData): Promise<any> {
        const remote = gitData.remote;
        const normalizedFile = file.replace(/^\/+/, "");
        try {
            return fs.emptyDir(`${target}`)
                .then(( ) => Utils.bash(`git archive --remote=ssh://git@${remote.host}:${remote.port}/${project}.git ${ref} ${normalizedFile} | tar -f - -xC ${target}`, cwd));
        } catch (e) {
            throw new ExitError(`Project include could not be fetched { project: ${project}, ref: ${ref}, file: ${normalizedFile} }`);
        }
    }
}
