import {WriteStreams} from "./types/write-streams";
import {GitData} from "./git-data";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import chalk from "chalk";
import {assert} from "./asserts";
import {Argv} from "./argv";

export class LocalProjects {

    static async init(argv: Argv, writeStreams: WriteStreams, gitData: GitData, home: string): Promise<{ [key: string]: string }> {
        const homeDir = home.replace(/\/$/, "");
        const homeProjectsFile = `${homeDir}/.gitlab-ci-local/projects.yml`;
        const projects: { [key: string]: string } = {};
        if (fs.existsSync(homeProjectsFile)) {
            const homeFileData: any = yaml.load(await fs.readFile(homeProjectsFile, "utf8"), {schema: yaml.FAILSAFE_SCHEMA});
            for (const [projectName, localPath] of Object.entries(homeFileData ?? [])) {
                assert(typeof projectName == "string", chalk`{red ERROR: project name must be a string}\n`);
                assert(typeof localPath == "string", chalk`{red ERROR: project local path must be a string}\n`);
                projects[projectName] = localPath.replace("~/", `${homeDir}/`);
            }
        }

        return projects;
    }

    static normalizeProjectKey(key: string, writeStreams: WriteStreams): string {
        if (!key.includes(":")) return key;
        writeStreams.stderr(chalk`{yellow WARNING: Interpreting '${key}' as '${key.replace(":", "/")}'}\n`);
        return key.replace(":", "/");
    }
}
