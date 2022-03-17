import chalk from "chalk";
import {Job} from "./job";
import {assert} from "./asserts";
import * as fs from "fs-extra";
import checksum from "checksum";
import base64url from "base64url";
import {ParseContext} from "./parser";
import execa from "execa";

export class Utils {

    static bash(shellScript: string, cwd = process.cwd(), env = process.env): execa.ExecaChildProcess {
        return execa(shellScript, {shell: "bash", cwd, env, all: true});
    }

    static spawn(cmdArgs: string[], cwd = process.cwd(), env = process.env): execa.ExecaChildProcess {
        return execa(cmdArgs[0], cmdArgs.slice(1), {cwd, env, all: true});
    }

    static fsUrl(url: string): string {
        return url.replace(/^https:\/\//g, "").replace(/^http:\/\//g, "");
    }

    static getJobByName(jobs: ReadonlyMap<string, Job>, name: string): Job {
        const job = jobs.get(name);
        assert(job != null, chalk`{blueBright ${name}} could not be found`);
        return job;
    }

    static getSafeJobName(jobName: string) {
        return jobName.replace(/[^\w-]+/g, (match) => {
            return base64url.encode(match);
        });
    }

    static forEachRealJob(pCtx: ParseContext, gitlabData: any, callback: (pCtx: ParseContext, jobName: string, jobData: any) => void) {
        for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
            if (Job.illegalJobNames.includes(jobName) || jobName[0] === ".") {
                continue;
            }
            callback(pCtx.in(jobName), jobName, jobData);
        }
    }

    static getJobNamesFromPreviousStages(jobs: ReadonlyMap<string, Job>, stages: readonly string[], currentJob: Job) {
        const jobNames: string[] = [];
        const currentStageIndex = stages.indexOf(currentJob.stage);
        jobs.forEach(job => {
            const stageIndex = stages.indexOf(job.stage);
            if (stageIndex < currentStageIndex) {
                jobNames.push(job.name);
            }
        });
        return jobNames;
    }

    static async getCoveragePercent(cwd: string, coverageRegex: string, jobName: string) {
        const content = await fs.readFile(`${cwd}/.gitlab-ci-local/output/${jobName}.log`, "utf8");
        const regex = new RegExp(coverageRegex.replace(/^\//, "").replace(/\/$/, ""), "m");
        const match = content.match(regex);
        if (match && match[0] != null) {
            const firstNumber = match[0].match(/\d+(\.\d+)?/);
            return firstNumber && firstNumber[0] ? firstNumber[0] : null;
        }
        return "0";
    }

    static printJobNames(stream: (txt: string) => void, job: { name: string }, i: number, arr: { name: string }[]) {
        if (i === arr.length - 1) {
            stream(chalk`{blueBright ${job.name}}`);
        } else {
            stream(chalk`{blueBright ${job.name}}, `);
        }
    }

    static expandText(text?: any, envs: { [key: string]: string | undefined } = process.env) {
        if (typeof text !== "string") {
            return text;
        }
        return text.replace(/[$][{]?\w*[}]?/g, (match) => {
            const sub = envs[match.replace(/^[$][{]?/, "").replace(/[}]?$/, "")];
            return sub || "";
        });
    }

    static expandVariables(variables: { [key: string]: string }, envs: { [key: string]: string }): { [key: string]: string } {
        const expandedVariables: { [key: string]: string } = {};
        for (const [key, value] of Object.entries(variables)) {
            expandedVariables[key] = Utils.expandText(value, envs);
        }
        return expandedVariables;
    }

    static textHasVariable(text?: any): boolean {
        if (typeof text !== "string") {
            return false;
        }
        return text.match(/[$][{]?\w*[}]?/g) != null;
    }

    static async rsyncTrackedFiles(cwd: string, target: string): Promise<{ hrdeltatime: [number, number] }> {
        const time = process.hrtime();
        await fs.mkdirp(`${cwd}/.gitlab-ci-local/builds/${target}`);
        await Utils.bash(`rsync -a --delete-excluded --delete --exclude-from=<(git ls-files -o --directory) --exclude .gitlab-ci-local/ ./ .gitlab-ci-local/builds/${target}/`, cwd);
        return {hrdeltatime: process.hrtime(time)};
    }

    static async checksumFiles(files: string[]): Promise<string> {
        const promises: Promise<string>[] = [];

        files.forEach((file) => {
            promises.push(new Promise((resolve, reject) => {
                checksum.file(file, (err, hash) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(hash);
                });
            }));
        });

        const result = await Promise.all(promises);
        return checksum(result.join(""));
    }
}
