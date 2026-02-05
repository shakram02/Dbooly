import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, ConnectionId } from '../models/connection';
import { ConnectionStorage } from './connection-storage';
import { log } from '../logger';

export class ConnectionManager {
    private connections: Map<ConnectionId, ConnectionConfig> = new Map();

    // Active connection state management
    private _activeConnectionId: ConnectionId | null = null;
    private _onDidChangeActiveConnection = new vscode.EventEmitter<ConnectionId | null>();
    readonly onDidChangeActiveConnection = this._onDidChangeActiveConnection.event;

    constructor(private readonly storage: ConnectionStorage) {}

    /**
     * Sets the active connection. Only one connection can be active at a time.
     * Fires onDidChangeActiveConnection event when the active connection changes.
     */
    setActiveConnection(id: ConnectionId | null): void {
        // Validate the connection exists if not null
        if (id !== null && !this.connections.has(id)) {
            return;
        }
        if (this._activeConnectionId !== id) {
            this._activeConnectionId = id;
            const connName = id ? this.connections.get(id)?.name : null;
            log(`ConnectionManager: Active connection changed to ${connName ? `"${connName}"` : 'none'}`);
            this._onDidChangeActiveConnection.fire(id);
        }
    }

    /**
     * Returns the currently active connection ID, or null if none is active.
     */
    getActiveConnectionId(): ConnectionId | null {
        return this._activeConnectionId;
    }

    /**
     * Disposes of the EventEmitter. Should be called on extension deactivation.
     */
    dispose(): void {
        this._onDidChangeActiveConnection.dispose();
    }

    async initialize(): Promise<void> {
        const connections = await this.storage.loadConnections();
        this.connections.clear();
        for (const conn of connections) {
            this.connections.set(conn.id, conn);
        }
        log(`ConnectionManager: Loaded ${connections.length} connection(s)`);
    }

    async addConnection(config: Omit<ConnectionConfigWithPassword, 'id'>): Promise<ConnectionConfig> {
        if (this.findByName(config.name)) {
            throw new Error(`Connection with name "${config.name}" already exists`);
        }

        const id = crypto.randomUUID();
        const { password, ...connectionWithoutPassword } = config;
        const connection: ConnectionConfig = { id, ...connectionWithoutPassword };

        this.connections.set(id, connection);
        await this.storage.setPassword(id, password);
        await this.storage.saveConnections(Array.from(this.connections.values()));

        return connection;
    }

    async updateConnection(id: ConnectionId, updates: Partial<Omit<ConnectionConfigWithPassword, 'id'>>): Promise<ConnectionConfig> {
        const existing = this.connections.get(id);
        if (!existing) {
            throw new Error(`Connection with id "${id}" not found`);
        }

        if (updates.name && updates.name !== existing.name && this.findByName(updates.name)) {
            throw new Error(`Connection with name "${updates.name}" already exists`);
        }

        const { password, ...updatesWithoutPassword } = updates as Partial<ConnectionConfigWithPassword>;
        const updated: ConnectionConfig = { ...existing, ...updatesWithoutPassword };

        this.connections.set(id, updated);
        if (password !== undefined) {
            await this.storage.setPassword(id, password);
        }
        await this.storage.saveConnections(Array.from(this.connections.values()));

        return updated;
    }

    async deleteConnection(id: ConnectionId): Promise<void> {
        if (!this.connections.has(id)) {
            throw new Error(`Connection with id "${id}" not found`);
        }

        // Auto-clear active connection if we're deleting it
        if (this._activeConnectionId === id) {
            this.setActiveConnection(null);
        }

        this.connections.delete(id);
        await this.storage.deletePassword(id);
        this.storage.clearStarredTables(id);
        await this.storage.saveConnections(Array.from(this.connections.values()));
    }

    getConnection(id: ConnectionId): ConnectionConfig | undefined {
        return this.connections.get(id);
    }

    getAllConnections(): ConnectionConfig[] {
        return Array.from(this.connections.values());
    }

    async getConnectionWithPassword(id: ConnectionId): Promise<ConnectionConfigWithPassword | undefined> {
        const connection = this.connections.get(id);
        if (!connection) {
            return undefined;
        }

        const password = await this.storage.getPassword(id) || '';
        return { ...connection, password };
    }

    getStorage(): ConnectionStorage {
        return this.storage;
    }

    private findByName(name: string): ConnectionConfig | undefined {
        for (const conn of this.connections.values()) {
            if (conn.name === name) {
                return conn;
            }
        }
        return undefined;
    }
}
