import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, ConnectionId, ConnectionScope, isSQLiteConnection } from '../models/connection';
import { ConnectionStorage } from './connection-storage';
import { GlobalConnectionStorage } from './global-connection-storage';
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

    constructor(
        private readonly projectStorage: ConnectionStorage,
        private readonly globalStorage: GlobalConnectionStorage,
    ) {}

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
        this.connections.clear();

        // Load project connections and migrate legacy ones missing scope
        const projectConnections = await this.projectStorage.loadConnections();
        let needsProjectResave = false;
        for (const conn of projectConnections) {
            if (!conn.scope) {
                (conn as { scope: ConnectionScope }).scope = 'project';
                needsProjectResave = true;
            }
            this.connections.set(conn.id, conn);
        }
        if (needsProjectResave && projectConnections.length > 0) {
            await this.projectStorage.saveConnections(projectConnections);
            log('ConnectionManager: Migrated legacy project connections (stamped scope)');
        }

        // Load global connections
        const globalConnections = await this.globalStorage.loadConnections();
        for (const conn of globalConnections) {
            if (!conn.scope) {
                (conn as { scope: ConnectionScope }).scope = 'global';
            }
            this.connections.set(conn.id, conn);
        }

        log(`ConnectionManager: Loaded ${projectConnections.length} project + ${globalConnections.length} global connection(s)`);
    }

    async addConnection(config: Omit<ConnectionConfigWithPassword, 'id'>): Promise<ConnectionConfig> {
        if (this.findByName(config.name)) {
            throw new Error(`Connection with name "${config.name}" already exists`);
        }

        const id = this.generateDeterministicId(config.name);
        const scope = config.scope || 'global';

        // SQLite doesn't have password, handle separately
        if (config.type === 'sqlite') {
            const connection = { id, ...config, scope } as ConnectionConfig;
            this.connections.set(id, connection);
            await this.saveConnectionsForScope(scope);
            return connection;
        }

        // MySQL and PostgreSQL password-based connections
        const { password, ...connectionWithoutPassword } = config as unknown as { password: string } & Record<string, unknown>;
        const connection = { id, ...connectionWithoutPassword, scope } as ConnectionConfig;

        this.connections.set(id, connection);
        await this.projectStorage.setPassword(id, password);
        await this.saveConnectionsForScope(scope);

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

        const { password, ...updatesWithoutPassword } = updates as { password?: string } & Record<string, unknown>;

        // Check if scope is changing — handle conversion
        const newScope = (updatesWithoutPassword.scope as ConnectionScope | undefined) || existing.scope;
        const scopeChanged = newScope !== existing.scope;

        const updated = { ...existing, ...updatesWithoutPassword, scope: newScope } as ConnectionConfig;

        this.connections.set(id, updated);
        if (password !== undefined) {
            await this.projectStorage.setPassword(id, password);
        }

        if (scopeChanged) {
            // Remove from old scope storage, save to new scope storage
            await this.saveConnectionsForScope(existing.scope);
            await this.saveConnectionsForScope(newScope);
            // Migrate starred tables
            this.migrateStarredTables(id, existing.scope, newScope);
        } else {
            await this.saveConnectionsForScope(existing.scope);
        }

        return updated;
    }

    async deleteConnection(id: ConnectionId): Promise<void> {
        const connection = this.connections.get(id);
        if (!connection) {
            throw new Error(`Connection with id "${id}" not found`);
        }

        // Auto-clear active connection if we're deleting it
        if (this._activeConnectionId === id) {
            this.setActiveConnection(null);
        }

        const scope = connection.scope;
        this.connections.delete(id);
        await this.projectStorage.deletePassword(id);
        this.getStorageForScope(scope).clearStarredTables(id);
        await this.saveConnectionsForScope(scope);
    }

    async convertConnectionScope(id: ConnectionId, targetScope: ConnectionScope): Promise<void> {
        const connection = this.connections.get(id);
        if (!connection) {
            throw new Error(`Connection with id "${id}" not found`);
        }

        if (connection.scope === targetScope) {
            return;
        }

        if (targetScope === 'project' && !vscode.workspace.workspaceFolders?.[0]) {
            throw new Error('Cannot convert to project scope: no project is open');
        }

        const oldScope = connection.scope;
        const updated = { ...connection, scope: targetScope };
        this.connections.set(id, updated);

        // Save both storages (remove from old, add to new)
        await this.saveConnectionsForScope(oldScope);
        await this.saveConnectionsForScope(targetScope);

        // Migrate starred tables
        this.migrateStarredTables(id, oldScope, targetScope);
    }

    getConnection(id: ConnectionId): ConnectionConfig | undefined {
        return this.connections.get(id);
    }

    /**
     * Returns all connections, project-scoped first, then global-scoped.
     * Within each group, insertion order is preserved.
     */
    getAllConnections(): ConnectionConfig[] {
        const all = Array.from(this.connections.values());
        const project = all.filter(c => c.scope === 'project');
        const global = all.filter(c => c.scope === 'global');
        return [...project, ...global];
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

        const password = await this.projectStorage.getPassword(id) || '';
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

        const existingPassword = await this.projectStorage.getPassword(id);

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

        const existingPassword = await this.projectStorage.getPassword(id);
        if (existingPassword) {
            return true;
        }

        return this.promptForPassword(id, connection.name);
    }

    /**
     * Returns the appropriate storage for starred tables based on connection scope.
     */
    getStorageForScope(scope: ConnectionScope): ConnectionStorage | GlobalConnectionStorage {
        return scope === 'global' ? this.globalStorage : this.projectStorage;
    }

    /**
     * Returns the project storage (for password operations and backwards compat).
     */
    getStorage(): ConnectionStorage {
        return this.projectStorage;
    }

    /**
     * Saves connections for the given scope. Used by tree provider after modifying starred tables.
     */
    async saveStarredTablesForScope(scope: ConnectionScope): Promise<void> {
        await this.saveConnectionsForScope(scope);
    }

    /**
     * Returns whether a project/workspace folder is currently open.
     */
    hasProjectOpen(): boolean {
        return !!vscode.workspace.workspaceFolders?.[0];
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
            await this.projectStorage.setPassword(id, password);
            this._onDidSetPassword.fire(id);
            return true;
        }

        return false;
    }

    /**
     * Saves only the connections belonging to a specific scope to the appropriate storage.
     */
    private async saveConnectionsForScope(scope: ConnectionScope): Promise<void> {
        const connections = Array.from(this.connections.values()).filter(c => c.scope === scope);
        if (scope === 'global') {
            await this.globalStorage.saveConnections(connections);
        } else {
            await this.projectStorage.saveConnections(connections);
        }
    }

    private migrateStarredTables(connectionId: ConnectionId, fromScope: ConnectionScope, toScope: ConnectionScope): void {
        const fromStorage = this.getStorageForScope(fromScope);
        const toStorage = this.getStorageForScope(toScope);
        const starred = fromStorage.getStarredTables(connectionId);
        for (const table of starred) {
            toStorage.setTableStarred(connectionId, table, true);
        }
        fromStorage.clearStarredTables(connectionId);
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
