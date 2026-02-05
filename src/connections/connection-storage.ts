import * as vscode from 'vscode';
import * as path from 'path';
import { ConnectionConfig, ConnectionId } from '../models/connection';

const CONNECTIONS_FILE = '.vscode/dbooly-connections.json';
const SECRET_KEY_PREFIX = 'dbooly.connection.password.';

interface StoredConnections {
    connections: ConnectionConfig[];
    starredTables?: Record<ConnectionId, string[]>;
}

export class ConnectionStorage {
    private starredTables: Map<ConnectionId, Set<string>> = new Map();

    constructor(private readonly secretStorage: vscode.SecretStorage) {}

    async loadConnections(): Promise<ConnectionConfig[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, CONNECTIONS_FILE);

        try {
            const content = await vscode.workspace.fs.readFile(filePath);
            const data: StoredConnections = JSON.parse(content.toString());

            // Load starred tables
            this.starredTables.clear();
            if (data.starredTables) {
                for (const [connId, tables] of Object.entries(data.starredTables)) {
                    this.starredTables.set(connId, new Set(tables));
                }
            }

            return data.connections || [];
        } catch {
            return [];
        }
    }

    async saveConnections(connections: ConnectionConfig[]): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const vscodeFolderPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
        try {
            await vscode.workspace.fs.stat(vscodeFolderPath);
        } catch {
            await vscode.workspace.fs.createDirectory(vscodeFolderPath);
        }

        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, CONNECTIONS_FILE);

        // Convert starred tables Map to plain object for JSON
        const starredTablesObj: Record<ConnectionId, string[]> = {};
        for (const [connId, tables] of this.starredTables) {
            if (tables.size > 0) {
                starredTablesObj[connId] = Array.from(tables).sort();
            }
        }

        const data: StoredConnections = {
            connections,
            ...(Object.keys(starredTablesObj).length > 0 && { starredTables: starredTablesObj }),
        };
        const content = Buffer.from(JSON.stringify(data, null, 2));
        await vscode.workspace.fs.writeFile(filePath, content);
    }

    async getPassword(connectionId: ConnectionId): Promise<string | undefined> {
        return this.secretStorage.get(SECRET_KEY_PREFIX + connectionId);
    }

    async setPassword(connectionId: ConnectionId, password: string): Promise<void> {
        await this.secretStorage.store(SECRET_KEY_PREFIX + connectionId, password);
    }

    async deletePassword(connectionId: ConnectionId): Promise<void> {
        await this.secretStorage.delete(SECRET_KEY_PREFIX + connectionId);
    }

    getStarredTables(connectionId: ConnectionId): Set<string> {
        return this.starredTables.get(connectionId) || new Set();
    }

    isTableStarred(connectionId: ConnectionId, tableName: string): boolean {
        return this.starredTables.get(connectionId)?.has(tableName) ?? false;
    }

    setTableStarred(connectionId: ConnectionId, tableName: string, starred: boolean): void {
        if (!this.starredTables.has(connectionId)) {
            this.starredTables.set(connectionId, new Set());
        }
        const tables = this.starredTables.get(connectionId)!;
        if (starred) {
            tables.add(tableName);
        } else {
            tables.delete(tableName);
        }
    }

    clearStarredTables(connectionId: ConnectionId): void {
        this.starredTables.delete(connectionId);
    }
}
