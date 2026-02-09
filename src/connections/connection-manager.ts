import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, ConnectionId, isSQLiteConnection } from '../models/connection';
import { ConnectionStorage } from './connection-storage';
import { log } from '../logger';

export class ConnectionManager {
    private connections: Map<ConnectionId, ConnectionConfig> = new Map();

    // Active connection state management
    private _activeConnectionId: ConnectionId | null = null;
    private _onDidChangeActiveConnection = new vscode.EventEmitter<ConnectionId | null>();
    readonly onDidChangeActiveConnection = this._onDidChangeActiveConnection.event;

    // Password set event - fired when user sets a password (for auto-starting background services)
    private _onDidSetPassword = new vscode.EventEmitter<ConnectionId>();
    readonly onDidSetPassword = this._onDidSetPassword.event;

    // Mutex for password prompts - prevents multiple concurrent prompts
    private passwordPromptInProgress: Map<ConnectionId, Promise<boolean>> = new Map();

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
     * Disposes of the EventEmitters. Should be called on extension deactivation.
     */
    dispose(): void {
        this._onDidChangeActiveConnection.dispose();
        this._onDidSetPassword.dispose();
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

        const id = this.generateDeterministicId(config.name);

        // SQLite doesn't have password, handle separately
        if (config.type === 'sqlite') {
            const connection: ConnectionConfig = { id, ...config };
            this.connections.set(id, connection);
            await this.storage.saveConnections(Array.from(this.connections.values()));
            return connection;
        }

        // MySQL and other password-based connections
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

        // SQLite doesn't need password
        if (isSQLiteConnection(connection)) {
            return connection;
        }

        const password = await this.storage.getPassword(id) || '';
        return { ...connection, password };
    }

    /**
     * Executes an operation with an authenticated connection.
     * Centralizes password checking and prompting logic.
     *
     * @param id - Connection ID
     * @param operation - Async operation to execute with the authenticated config
     * @param options.silent - If true, returns null when no password instead of prompting
     * @returns Operation result, or null if authentication failed/cancelled
     */
    async withAuthenticatedConnection<T>(
        id: ConnectionId,
        operation: (config: ConnectionConfigWithPassword) => Promise<T>,
        options?: { silent?: boolean }
    ): Promise<T | null> {
        const connection = this.connections.get(id);
        if (!connection) {
            return null;
        }

        // SQLite doesn't require password authentication
        if (isSQLiteConnection(connection)) {
            return operation(connection);
        }

        const existingPassword = await this.storage.getPassword(id);

        if (!existingPassword) {
            // No password set
            if (options?.silent) {
                return null;
            }

            // Prompt for password
            const passwordSet = await this.promptForPassword(id, connection.name);
            if (!passwordSet) {
                return null;
            }
        }

        const config = await this.getConnectionWithPassword(id);
        if (!config) {
            return null;
        }

        return operation(config);
    }

    /**
     * Prompts user to set password if missing. Returns true if password exists or was set.
     * Uses a mutex to prevent multiple concurrent password prompts for the same connection.
     * SQLite connections always return true (no password needed).
     * @internal Prefer using withAuthenticatedConnection instead.
     */
    async ensurePassword(id: ConnectionId): Promise<boolean> {
        const connection = this.connections.get(id);
        if (!connection) {
            return false;
        }

        // SQLite doesn't need password
        if (isSQLiteConnection(connection)) {
            return true;
        }

        const existingPassword = await this.storage.getPassword(id);
        if (existingPassword) {
            return true;
        }

        return this.promptForPassword(id, connection.name);
    }

    /**
     * Prompts user for password with mutex to prevent concurrent prompts.
     * Fires onDidSetPassword event when password is successfully set.
     */
    private async promptForPassword(id: ConnectionId, connectionName: string): Promise<boolean> {
        // Check if a prompt is already in progress for this connection
        const existingPrompt = this.passwordPromptInProgress.get(id);
        if (existingPrompt) {
            return existingPrompt;
        }

        // Create and store the prompt promise
        const promptPromise = this.showPasswordPrompt(id, connectionName);
        this.passwordPromptInProgress.set(id, promptPromise);

        try {
            return await promptPromise;
        } finally {
            this.passwordPromptInProgress.delete(id);
        }
    }

    /**
     * Internal method that shows the actual password prompt UI.
     */
    private async showPasswordPrompt(id: ConnectionId, connectionName: string): Promise<boolean> {
        const password = await vscode.window.showInputBox({
            prompt: `Enter password for "${connectionName}" (no password stored)`,
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'Database password'
        });

        if (password) {
            await this.storage.setPassword(id, password);
            this._onDidSetPassword.fire(id);
            return true;
        }

        return false;
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

    private generateDeterministicId(name: string): ConnectionId {
        return crypto.createHash('sha256').update(name).digest('hex').slice(0, 12);
    }
}
