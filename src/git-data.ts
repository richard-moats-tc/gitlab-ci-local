import {Utils} from "./utils";
import {assert} from "./asserts";
import {WriteStreams} from "./types/write-streams";
import chalk from "chalk";
import {ExitError} from "./types/exit-error";

export class GitData {

    public readonly user = {
        GITLAB_USER_LOGIN: "local",
        GITLAB_USER_EMAIL: "local@gitlab.com",
        GITLAB_USER_NAME: "Bob Local",
        GITLAB_USER_ID: "1000",
    };

    public readonly remote = {
        port: "22",
        host: "gitlab.com",
        group: "fallback.group",
        project: "fallback.project",
        default_branch: "main",
    };

    public readonly commit = {
        REF_NAME: "main",
        SHA: "0000000000000000000000000000000000000000",
        SHORT_SHA: "00000000",
    };

    get CI_PROJECT_PATH() {
        return `${this.remote.group}/${this.remote.project}`;
    }

    get CI_REGISTRY() {
        return `local-registry.${this.remote.host}`;
    }

    get CI_REGISTRY_IMAGE() {
        return `${this.CI_REGISTRY}/${this.CI_PROJECT_PATH}`;
    }

    get CI_PROJECT_PATH_SLUG() {
        return `${this.remote.group.replace(/\//g, "-")}-${this.remote.project}`;
    }

    static async init(cwd: string, writeStreams: WriteStreams): Promise<GitData> {
        const gitData = new GitData();
        const promises = [];
        promises.push(gitData.initCommitData(cwd, writeStreams));
        promises.push(gitData.initRemoteData(cwd, writeStreams));
        promises.push(gitData.initUserData(cwd, writeStreams));
        await Promise.all(promises);
        return gitData;
    }

    private async initCommitData(cwd: string, writeStreams: WriteStreams): Promise<void> {
        const promises = [];

        const refNamePromise = Utils.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd);
        refNamePromise.then(({stdout}) => {
            this.commit.REF_NAME = stdout.trimEnd();
        });
        promises.push(refNamePromise);

        const shaPromise = Utils.spawn(["git", "rev-parse", "HEAD"], cwd);
        shaPromise.then(({stdout}) => {
            this.commit.SHA = stdout.trimEnd();
        });
        promises.push(shaPromise);

        const shortShaPromise = Utils.spawn(["git", "rev-parse", "--short", "HEAD"], cwd);
        shortShaPromise.then(({stdout}) => {
            this.commit.SHORT_SHA = stdout.trimEnd();
        });
        promises.push(shortShaPromise);

        try {
            await Promise.all(promises);
        } catch (e) {
            if (e instanceof ExitError) {
                return writeStreams.stderr(chalk`{yellow ${e.message}}\n`);
            }
            writeStreams.stderr(chalk`{yellow Using fallback git commit data}\n`);
        }
    }

    private async initRemoteData(cwd: string, writeStreams: WriteStreams): Promise<void> {
        try {
            // get GitLab version for feature emulation: https://docs.gitlab.com/ee/api/version.html

            const { stdout: gitRemote } = await Utils.spawn(["git", "remote", "-v"], cwd);
            const gitRemoteMatch = gitRemote.match(/.*(?:\/\/|@)(?<host>[^:/]*)(:(?<port>\d+)\/|:|\/)(?<group>.*)\/(?<project>.*?)(?:\r?\n|\.git)/);

            assert(gitRemoteMatch?.groups != null, "git remote -v didn't provide valid matches");

            this.remote.port = gitRemoteMatch.groups.port ?? "22";
            this.remote.host = gitRemoteMatch.groups.host;
            this.remote.group = gitRemoteMatch.groups.group;
            this.remote.project = gitRemoteMatch.groups.project;

            const { stdout: gitRemoteList } = await Utils.spawn(["git", "ls-remot\", \"--symref\", \"origin\", \"HEAD"], cwd);
            const gitRemoteHeads = gitRemoteList.match(/ref: refs\/.*?\/(?<default>\w+)\s+HEAD/);

            assert(gitRemoteHeads?.groups != null, "git ls-remote HEAD didn't provide valid matches");

            this.remote.default_branch = gitRemoteHeads.groups.default;
        } catch (e) {
            if (e instanceof ExitError) {
                writeStreams.stderr(chalk`{yellow ${e.message}}\n`);
                return;
            }
            writeStreams.stderr(chalk`{yellow Using fallback git remote data}\n`);
        }
    }

    async initUserData(cwd: string, writeStreams: WriteStreams): Promise<void> {
        const promises = [];

        const gitUsernamePromise = Utils.spawn(["git", "config", "user.name"], cwd).then(({stdout}) => {
            this.user.GITLAB_USER_NAME = stdout.trimEnd();
        }).catch(() => {
            writeStreams.stderr(chalk`{yellow Using fallback git user.name}\n`);
        });
        promises.push(gitUsernamePromise);

        const gitEmailPromise = Utils.spawn(["git", "config", "user.email"], cwd).then(({stdout}) => {
            const email = stdout.trimEnd();
            this.user.GITLAB_USER_EMAIL = email;
            this.user.GITLAB_USER_LOGIN = email.replace(/@.*/, "");
        }).catch(() => {
            writeStreams.stderr(chalk`{yellow Using fallback git user.email}\n`);
        });
        promises.push(gitEmailPromise);

        const osUidPromise = Utils.spawn(["id", "-u"], cwd).then(({stdout}) => {
            this.user.GITLAB_USER_ID = stdout.trimEnd();
        }).catch(() => {
            writeStreams.stderr(chalk`{yellow Using fallback linux user id}\n`);
        });
        promises.push(osUidPromise);

        await Promise.all(promises);
    }
}
