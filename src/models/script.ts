export type ScriptId = string;
export type FolderId = string;

export interface Script {
    id: ScriptId;
    filePath: string; // Path to .sql file in global storage
    parentFolderId?: FolderId;
}

export interface ScriptFolder {
    id: FolderId;
    name: string;
    parentFolderId?: FolderId;
}
