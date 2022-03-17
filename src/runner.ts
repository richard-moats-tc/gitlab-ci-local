export interface RunnerOptions {
    manual: string[];
    cwd?: string;
    needs?: boolean;
    variables: { [key: string]: string };
    file?: string;
    home?: string;
    shell_isolation?: boolean;
    mount_cache?: boolean;
    privileged?: boolean;
    volumes: string[];
    extra_hosts: string[];
}
