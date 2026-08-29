import type { ProcmClient } from "./client.js";
export interface ImportProcessItem {
    script: string;
    args: string[];
    cwd: string;
    name?: string;
    desc?: string;
}
export type ProcessStatus = "spawning" | "running" | "exited" | "error";
export interface ProcessView {
    id: string;
    name: string;
    script: string;
    args: string[];
    cwd: string;
    status: ProcessStatus;
    pid: number | null;
    exitCode: number | null;
    error: string | null;
    desc?: string | null;
    group?: string | null;
    port?: number | null;
    roomId?: string | null;
    startedAt?: number;
    lastStartedAt?: number | null;
    stoppedAt?: number | null;
    favorite?: boolean;
}
export interface ProcessListResponse {
    serverId: string;
    pid: number;
    startedAt?: number;
    port?: number | null;
    processes: ProcessView[];
}
export interface UpdateProcessBody {
    name?: string;
    script?: string;
    args?: string[];
    cwd?: string;
    desc?: string | null;
    port?: number | null;
    envs?: Record<string, string>;
    group?: string | null;
}
export interface ServerLogFile {
    name: string;
    path: string;
    size: number;
    modifiedAt: number;
}
export interface ServerLogInfo {
    dir: string;
    maxBytes: number;
    defaultMaxBytes: number;
    envMaxBytes: number | null;
    files: ServerLogFile[];
}
export declare function listProcesses(client: ProcmClient): Promise<ProcessListResponse>;
export declare function getProcess(client: ProcmClient, id: string): Promise<ProcessView>;
export declare function updateProcess(client: ProcmClient, id: string, updates: UpdateProcessBody): Promise<ProcessView>;
export declare function getServerLogInfo(client: ProcmClient): Promise<ServerLogInfo>;
export declare function updateServerLogMaxBytes(client: ProcmClient, maxBytes: number | null): Promise<ServerLogInfo>;
export declare function clearServerLogs(client: ProcmClient): Promise<{
    cleared: string[];
}>;
export declare function clearProcessLogs(client: ProcmClient, id: string): Promise<{
    id: string;
    cleared: true;
}>;
/** Clear logs for the process represented by the client. */
export declare function clearLogs(client: ProcmClient, id?: string | undefined): Promise<{
    id: string;
    cleared: true;
}>;
export declare function importProcessBatch(client: ProcmClient, items: ImportProcessItem[], group?: string): Promise<{
    imported: {
        id: string;
        name: string;
        favorite: boolean;
    }[];
}>;
export declare const batchImportProcesses: typeof importProcessBatch;
export declare function selectDirectory(client: ProcmClient, title?: string): Promise<string | null>;
//# sourceMappingURL=rest.d.ts.map