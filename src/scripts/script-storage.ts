import * as vscode from 'vscode';
import { Script, ScriptFolder, ScriptId, FolderId } from '../models/script';

const SCRIPTS_KEY = 'dbooly.scripts';
const FOLDERS_KEY = 'dbooly.scriptFolders';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function generateTimestampFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `script_${year}${month}${day}_${hours}${minutes}${seconds}.sql`;
}

export class ScriptStorage {
    private scriptsDir: vscode.Uri;

    constructor(
        private readonly globalState: vscode.Memento,
        private readonly globalStorageUri: vscode.Uri
    ) {
        this.scriptsDir = vscode.Uri.joinPath(globalStorageUri, 'scripts');
    }

    async ensureScriptsDir(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.scriptsDir);
        } catch {
            // Directory may already exist
        }
    }

    getAllScripts(): Script[] {
        return this.globalState.get<Script[]>(SCRIPTS_KEY, []);
    }

    getAllFolders(): ScriptFolder[] {
        return this.globalState.get<ScriptFolder[]>(FOLDERS_KEY, []);
    }

    getScript(id: ScriptId): Script | undefined {
        return this.getAllScripts().find((s) => s.id === id);
    }

    getFolder(id: FolderId): ScriptFolder | undefined {
        return this.getAllFolders().find((f) => f.id === id);
    }

    async createScript(parentFolderId?: FolderId): Promise<Script> {
        await this.ensureScriptsDir();

        const filename = generateTimestampFilename();
        const filePath = vscode.Uri.joinPath(this.scriptsDir, filename).fsPath;

        // Create empty SQL file
        const fileUri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());

        const script: Script = {
            id: generateUUID(),
            filePath,
            parentFolderId,
        };
        const scripts = this.getAllScripts();
        scripts.push(script);
        await this.globalState.update(SCRIPTS_KEY, scripts);
        return script;
    }

    getScriptName(script: Script): string {
        // Extract filename without extension from path
        const filename = script.filePath.split(/[/\\]/).pop() || 'script.sql';
        return filename.replace(/\.sql$/, '');
    }

    async readScriptContent(script: Script): Promise<string> {
        try {
            const fileUri = vscode.Uri.file(script.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            return Buffer.from(content).toString('utf-8');
        } catch {
            return '';
        }
    }

    async writeScriptContent(script: Script, content: string): Promise<void> {
        const fileUri = vscode.Uri.file(script.filePath);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    }

    async renameScript(id: ScriptId, newName: string): Promise<Script | undefined> {
        const script = this.getScript(id);
        if (!script) {
            return undefined;
        }

        // Rename the actual file
        const oldUri = vscode.Uri.file(script.filePath);
        const newFilename = newName.endsWith('.sql') ? newName : `${newName}.sql`;
        const newFilePath = vscode.Uri.joinPath(this.scriptsDir, newFilename).fsPath;
        const newUri = vscode.Uri.file(newFilePath);

        try {
            await vscode.workspace.fs.rename(oldUri, newUri);
        } catch {
            // If rename fails, keep the old path
            return script;
        }

        // Update the script record
        const scripts = this.getAllScripts();
        const index = scripts.findIndex((s) => s.id === id);
        if (index !== -1) {
            scripts[index] = { ...scripts[index], filePath: newFilePath };
            await this.globalState.update(SCRIPTS_KEY, scripts);
            return scripts[index];
        }
        return script;
    }

    async deleteScript(id: ScriptId): Promise<void> {
        const script = this.getScript(id);
        if (script) {
            // Delete the file
            try {
                const fileUri = vscode.Uri.file(script.filePath);
                await vscode.workspace.fs.delete(fileUri);
            } catch {
                // File may not exist
            }
        }

        const scripts = this.getAllScripts().filter((s) => s.id !== id);
        await this.globalState.update(SCRIPTS_KEY, scripts);
    }

    async saveFolder(name: string, parentFolderId?: FolderId): Promise<ScriptFolder> {
        const folder: ScriptFolder = {
            id: generateUUID(),
            name,
            parentFolderId,
        };
        const folders = this.getAllFolders();
        folders.push(folder);
        await this.globalState.update(FOLDERS_KEY, folders);
        return folder;
    }

    async updateFolder(id: FolderId, updates: Partial<Omit<ScriptFolder, 'id'>>): Promise<void> {
        const folders = this.getAllFolders();
        const index = folders.findIndex((f) => f.id === id);
        if (index !== -1) {
            folders[index] = { ...folders[index], ...updates };
            await this.globalState.update(FOLDERS_KEY, folders);
        }
    }

    async deleteFolder(id: FolderId): Promise<void> {
        const folders = this.getAllFolders().filter((f) => f.id !== id);
        await this.globalState.update(FOLDERS_KEY, folders);
    }

    async deleteFolderRecursive(id: FolderId): Promise<void> {
        const allFolders = this.getAllFolders();
        const allScripts = this.getAllScripts();

        // Collect all folder IDs to delete (the folder itself and all descendants)
        const folderIdsToDelete = new Set<FolderId>();
        const collectDescendantFolders = (folderId: FolderId) => {
            folderIdsToDelete.add(folderId);
            for (const folder of allFolders) {
                if (folder.parentFolderId === folderId) {
                    collectDescendantFolders(folder.id);
                }
            }
        };
        collectDescendantFolders(id);

        // Delete script files in folders being deleted
        for (const script of allScripts) {
            if (script.parentFolderId && folderIdsToDelete.has(script.parentFolderId)) {
                try {
                    const fileUri = vscode.Uri.file(script.filePath);
                    await vscode.workspace.fs.delete(fileUri);
                } catch {
                    // File may not exist
                }
            }
        }

        // Filter out deleted folders and their scripts
        const remainingFolders = allFolders.filter((f) => !folderIdsToDelete.has(f.id));
        const remainingScripts = allScripts.filter(
            (s) => !s.parentFolderId || !folderIdsToDelete.has(s.parentFolderId)
        );

        await this.globalState.update(FOLDERS_KEY, remainingFolders);
        await this.globalState.update(SCRIPTS_KEY, remainingScripts);
    }

    getFolderContents(folderId: FolderId): { hasChildren: boolean; childCount: number } {
        const scripts = this.getAllScripts().filter((s) => s.parentFolderId === folderId);
        const folders = this.getAllFolders().filter((f) => f.parentFolderId === folderId);
        const childCount = scripts.length + folders.length;
        return { hasChildren: childCount > 0, childCount };
    }

    getScriptFileUri(script: Script): vscode.Uri {
        return vscode.Uri.file(script.filePath);
    }
}
