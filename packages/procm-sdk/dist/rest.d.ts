import type { ProcmClient } from "./client.js";
export interface ImportProcessItem {
    script: string;
    args: string[];
    cwd: string;
    name?: string;
    desc?: string;
}
export declare function clearProcessLogs(client: ProcmClient, id: string): Promise<{
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