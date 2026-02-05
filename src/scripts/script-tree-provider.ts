import * as vscode from 'vscode';
import { Script, ScriptFolder, ScriptId, FolderId } from '../models/script';
import { ScriptStorage } from './script-storage';

export class ScriptTreeItem extends vscode.TreeItem {
    constructor(public readonly script: Script, displayName: string) {
        super(displayName, vscode.TreeItemCollapsibleState.None);

        this.contextValue = 'script';
        this.iconPath = new vscode.ThemeIcon('database');
        this.tooltip = script.filePath;

        // Double-click opens the script
        this.command = {
            command: 'dbooly.openScript',
            title: 'Open Script',
            arguments: [this],
        };
    }
}

export class FolderTreeItem extends vscode.TreeItem {
    constructor(public readonly folder: ScriptFolder) {
        super(folder.name, vscode.TreeItemCollapsibleState.Collapsed);

        this.contextValue = 'scriptFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.tooltip = folder.name;
    }
}

export type ScriptTreeItemType = ScriptTreeItem | FolderTreeItem;

export class ScriptTreeProvider implements vscode.TreeDataProvider<ScriptTreeItemType> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ScriptTreeItemType | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly storage: ScriptStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ScriptTreeItemType): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ScriptTreeItemType): ScriptTreeItemType[] {
        const parentFolderId = element instanceof FolderTreeItem ? element.folder.id : undefined;

        const folders = this.storage
            .getAllFolders()
            .filter((f) => f.parentFolderId === parentFolderId);
        const scripts = this.storage
            .getAllScripts()
            .filter((s) => s.parentFolderId === parentFolderId);

        // Sort: folders first (alphabetically), then scripts (alphabetically)
        const sortedFolders = folders.sort((a, b) => a.name.localeCompare(b.name));
        const sortedScripts = scripts.sort((a, b) => a.name.localeCompare(b.name));

        const folderItems = sortedFolders.map((f) => new FolderTreeItem(f));
        const scriptItems = sortedScripts.map((s) => new ScriptTreeItem(s, this.storage.getScriptName(s)));

        return [...folderItems, ...scriptItems];
    }
}

export function registerScriptTreeView(
    context: vscode.ExtensionContext,
    storage: ScriptStorage
): ScriptTreeProvider {
    const treeProvider = new ScriptTreeProvider(storage);

    const treeView = vscode.window.createTreeView('dbooly.scripts', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    context.subscriptions.push(treeView);

    return treeProvider;
}
