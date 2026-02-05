import * as vscode from 'vscode';
import { ScriptStorage } from './script-storage';
import { ScriptTreeProvider, ScriptTreeItem, FolderTreeItem } from './script-tree-provider';
import { FolderId } from '../models/script';

export function registerScriptCommands(
    context: vscode.ExtensionContext,
    storage: ScriptStorage,
    treeProvider: ScriptTreeProvider
): void {
    // Add Script (at root)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.addScript', async () => {
            await createScript(storage, treeProvider);
        })
    );

    // Add Folder (at root)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.addScriptFolder', async () => {
            await createFolder(storage, treeProvider);
        })
    );

    // Open Script
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.openScript', async (item: ScriptTreeItem) => {
            if (!item?.script) {
                return;
            }
            // Open the actual SQL file
            const fileUri = storage.getScriptFileUri(item.script);
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc, { preview: false });
        })
    );

    // Rename Script
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.renameScript', async (item: ScriptTreeItem) => {
            if (!item?.script) {
                return;
            }
            const currentName = storage.getScriptName(item.script);
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new script name',
                value: currentName,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Script name cannot be empty';
                    }
                    return null;
                },
            });
            if (newName && newName !== currentName) {
                await storage.renameScript(item.script.id, newName);
                treeProvider.refresh();
            }
        })
    );

    // Delete Script
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.deleteScript', async (item: ScriptTreeItem) => {
            if (!item?.script) {
                return;
            }
            const confirm = await vscode.window.showWarningMessage(
                `Delete script "${item.script.name}"?`,
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                await storage.deleteScript(item.script.id);
                treeProvider.refresh();
            }
        })
    );

    // Rename Folder
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.renameScriptFolder', async (item: FolderTreeItem) => {
            if (!item?.folder) {
                return;
            }
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new folder name',
                value: item.folder.name,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Folder name cannot be empty';
                    }
                    return null;
                },
            });
            if (newName && newName !== item.folder.name) {
                await storage.updateFolder(item.folder.id, { name: newName });
                treeProvider.refresh();
            }
        })
    );

    // Delete Folder
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.deleteScriptFolder', async (item: FolderTreeItem) => {
            if (!item?.folder) {
                return;
            }
            const { hasChildren, childCount } = storage.getFolderContents(item.folder.id);

            let message: string;
            if (hasChildren) {
                message = `Delete folder "${item.folder.name}" and its ${childCount} item(s)?`;
            } else {
                message = `Delete folder "${item.folder.name}"?`;
            }

            const confirm = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                await storage.deleteFolderRecursive(item.folder.id);
                treeProvider.refresh();
            }
        })
    );

    // New Script in Folder
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.newScriptInFolder', async (item: FolderTreeItem) => {
            if (!item?.folder) {
                return;
            }
            await createScript(storage, treeProvider, item.folder.id);
        })
    );

    // New Folder in Folder
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.newFolderInFolder', async (item: FolderTreeItem) => {
            if (!item?.folder) {
                return;
            }
            await createFolder(storage, treeProvider, item.folder.id);
        })
    );
}

async function createScript(
    storage: ScriptStorage,
    treeProvider: ScriptTreeProvider,
    parentFolderId?: FolderId
): Promise<void> {
    const script = await storage.createScript(parentFolderId);
    treeProvider.refresh();

    // Open the newly created script file
    const fileUri = storage.getScriptFileUri(script);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, { preview: false });
}

async function createFolder(
    storage: ScriptStorage,
    treeProvider: ScriptTreeProvider,
    parentFolderId?: FolderId
): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Folder',
        validateInput: (value) => {
            if (!value.trim()) {
                return 'Folder name cannot be empty';
            }
            return null;
        },
    });
    if (!name) {
        return;
    }

    await storage.saveFolder(name, parentFolderId);
    treeProvider.refresh();
}
