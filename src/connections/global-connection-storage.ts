import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionId } from '../models/connection';

const GLOBAL_CONNECTIONS_FILE = 'dbooly-global-connections.json';

interface StoredConnections {
    connections: ConnectionConfig[];
    starredTables?: Record<ConnectionId, string[]>;
}

export class GlobalConnectionStorage {
    private starredTables: Map<ConnectionId, Set<string>> = new Map();

    constructor(private readonly globalStorageUri: vscode.Uri) {}

    async loadConnections(): Promise<ConnectionConfig[]> {
        const filePath = vscode.Uri.joinPath(this.globalStorageUri, GLOBAL_CONNECTIONS_FILE);

        try {
            const content = await vscode.workspace.fs.readFile(filePath);
            const data: StoredConnections = JSON.parse(content.toString());

            // Load starred tables
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
        // Ensure global storage directory exists
        try {
            await vscode.workspace.fs.stat(this.globalStorageUri);
        } catch {
            await vscode.workspace.fs.createDirectory(this.globalStorageUri);
        }

        const filePath = vscode.Uri.joinPath(this.globalStorageUri, GLOBAL_CONNECTIONS_FILE);

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
