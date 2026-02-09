import * as vscode from 'vscode';
import { ConnectionManager } from './connection-manager';
import { testConnection } from './connection-tester';
import { ConnectionConfig, ConnectionId, isMySQLConnection } from '../models/connection';
import { ConnectionTreeItem, ConnectionTreeProvider } from './connection-tree-provider';
import { ConnectionFormPanel } from './connection-form';

function getConnectionDescription(c: ConnectionConfig): string {
    if (isMySQLConnection(c)) {
        return `${c.type} - ${c.host}:${c.port}`;
    }
    return `${c.type} - ${c.filePath}`;
}

function getConnectionDetail(c: ConnectionConfig): string {
    if (isMySQLConnection(c)) {
        return `${c.username}@${c.host}:${c.port}/${c.database}`;
    }
    return c.filePath;
}

let treeProvider: ConnectionTreeProvider | undefined;
let extensionUri: vscode.Uri;

export function setTreeProvider(provider: ConnectionTreeProvider): void {
    treeProvider = provider;
}

export function setExtensionUri(uri: vscode.Uri): void {
    extensionUri = uri;
}

function refreshTree(): void {
    treeProvider?.refresh();
}

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.addConnection', () => addConnectionCommand(connectionManager)),
        vscode.commands.registerCommand('dbooly.editConnection', (item?: ConnectionTreeItem) => editConnectionCommand(connectionManager, item)),
        vscode.commands.registerCommand('dbooly.deleteConnection', (item?: ConnectionTreeItem) => deleteConnectionCommand(connectionManager, item)),
        vscode.commands.registerCommand('dbooly.listConnections', () => listConnectionsCommand(connectionManager))
    );
}

async function addConnectionCommand(manager: ConnectionManager): Promise<void> {
    ConnectionFormPanel.show(
        extensionUri,
        undefined,
        'Add Connection',
        async (data) => {
            const connection = await manager.addConnection(data);
            // Auto-activate the new connection for immediate use
            manager.setActiveConnection(connection.id);
            vscode.window.showInformationMessage(`Connection "${data.name}" saved and activated`);
            refreshTree();
        },
        async (data) => testConnection(data)
    );
}

async function editConnectionCommand(manager: ConnectionManager, treeItem?: ConnectionTreeItem): Promise<void> {
    let connectionId: ConnectionId;

    if (treeItem) {
        connectionId = treeItem.connection.id;
    } else {
        const connections = manager.getAllConnections();
        if (connections.length === 0) {
            vscode.window.showInformationMessage('No connections to edit');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            connections.map(c => ({ label: c.name, description: getConnectionDescription(c), id: c.id })),
            { placeHolder: 'Select connection to edit' }
        );

        if (!selected) {
            return;
        }
        connectionId = selected.id;
    }

    const existing = await manager.getConnectionWithPassword(connectionId);
    if (!existing) {
        vscode.window.showErrorMessage('Connection not found');
        return;
    }

    ConnectionFormPanel.show(
        extensionUri,
        existing,
        `Edit Connection: ${existing.name}`,
        async (data) => {
            await manager.updateConnection(connectionId, data);
            vscode.window.showInformationMessage(`Connection "${data.name}" updated successfully`);
            refreshTree();
        },
        async (data) => testConnection(data)
    );
}

async function deleteConnectionCommand(manager: ConnectionManager, treeItem?: ConnectionTreeItem): Promise<void> {
    let connectionId: ConnectionId;
    let connectionName: string;

    if (treeItem) {
        connectionId = treeItem.connection.id;
        connectionName = treeItem.connection.name;
    } else {
        const connections = manager.getAllConnections();
        if (connections.length === 0) {
            vscode.window.showInformationMessage('No connections to delete');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            connections.map(c => ({ label: c.name, description: getConnectionDescription(c), id: c.id })),
            { placeHolder: 'Select connection to delete' }
        );

        if (!selected) {
            return;
        }
        connectionId = selected.id;
        connectionName = selected.label;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Delete connection "${connectionName}"?`,
        { modal: true },
        'Delete'
    );

    if (confirm !== 'Delete') {
        return;
    }

    try {
        await manager.deleteConnection(connectionId);
        vscode.window.showInformationMessage(`Connection "${connectionName}" deleted`);
        refreshTree();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(message);
    }
}

async function listConnectionsCommand(manager: ConnectionManager): Promise<void> {
    const connections = manager.getAllConnections();
    if (connections.length === 0) {
        vscode.window.showInformationMessage('No saved connections');
        return;
    }

    const items = connections.map(c => ({
        label: c.name,
        description: `${c.type}`,
        detail: getConnectionDetail(c),
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Saved connections',
        canPickMany: false,
    });
}
