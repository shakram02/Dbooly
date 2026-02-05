import * as vscode from 'vscode';
import { ConnectionId } from '../models/connection';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { ConnectionManager } from '../connections/connection-manager';
import { ConnectionPool } from '../connections/connection-pool';
import { getSchemaProvider } from '../providers/schema-provider';
import { log, logError } from '../logger';

export interface CachedSchema {
    connectionId: ConnectionId;
    tables: TableInfo[];
    columns: Map<string, ColumnInfo[]>; // tableName -> columns
    fetchedAt: number;
}

/** JSON-serializable version of CachedSchema (Map -> Object) */
interface SerializedSchema {
    connectionId: ConnectionId;
    tables: TableInfo[];
    columns: Record<string, ColumnInfo[]>;
    fetchedAt: number;
}

export type SchemaCacheState =
    | { status: 'empty' }
    | { status: 'loading'; promise: Promise<CachedSchema | null> }
    | { status: 'ready'; schema: CachedSchema }
    | { status: 'error'; error: string };

export class SchemaCache implements vscode.Disposable {
    private cache: Map<ConnectionId, SchemaCacheState> = new Map();
    private disposables: vscode.Disposable[] = [];
    private cacheDir: vscode.Uri;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool,
        globalStorageUri: vscode.Uri
    ) {
        this.cacheDir = vscode.Uri.joinPath(globalStorageUri, 'schema-cache');

        // Subscribe to connection changes - pre-fetch schema when connection activates
        this.disposables.push(
            connectionManager.onDidChangeActiveConnection((connectionId) => {
                log(`SchemaCache: Active connection changed to ${connectionId ?? 'none'}`);
                if (connectionId && !this.cache.has(connectionId)) {
                    // Pre-fetch schema in background so it's ready when user needs it
                    log(`SchemaCache: Pre-fetching schema for newly activated connection`);
                    this.loadSchema(connectionId);
                }
            })
        );
    }

    /**
     * Gets the cached schema for the active connection.
     * Returns null if no connection is active.
     * Loads schema lazily if not already cached.
     */
    async getSchema(): Promise<CachedSchema | null> {
        const connectionId = this.connectionManager.getActiveConnectionId();
        if (!connectionId) {
            return null;
        }

        const state = this.cache.get(connectionId);

        if (state?.status === 'ready') {
            return state.schema;
        }

        if (state?.status === 'loading') {
            return state.promise;
        }

        // Load schema
        return this.loadSchema(connectionId);
    }

    /**
     * Gets the current cache state for the active connection.
     * Used to determine if we should show a loading indicator.
     * If there's an active connection but no cache, triggers lazy loading.
     */
    getState(): SchemaCacheState {
        const connectionId = this.connectionManager.getActiveConnectionId();
        if (!connectionId) {
            return { status: 'empty' };
        }

        const cached = this.cache.get(connectionId);
        if (cached) {
            return cached;
        }

        // Active connection exists but no cache - trigger lazy load
        // This sets the cache to 'loading' state
        this.loadSchema(connectionId);
        return this.cache.get(connectionId) ?? { status: 'loading', promise: Promise.resolve(null) };
    }

    /**
     * Refreshes the schema cache for the active connection.
     */
    async refresh(): Promise<void> {
        const connectionId = this.connectionManager.getActiveConnectionId();
        if (!connectionId) {
            return;
        }

        this.cache.delete(connectionId);
        await this.loadSchema(connectionId);
    }

    /**
     * Clears the cache for a specific connection or all connections.
     */
    clear(connectionId?: ConnectionId): void {
        if (connectionId) {
            this.cache.delete(connectionId);
        } else {
            this.cache.clear();
        }
    }

    private async loadSchema(connectionId: ConnectionId): Promise<CachedSchema | null> {
        // First, try to load from disk cache for instant results
        const diskSchema = await this.loadFromDisk(connectionId);

        if (diskSchema) {
            // Serve disk cache immediately
            this.cache.set(connectionId, {
                status: 'ready',
                schema: diskSchema
            });
            log(`SchemaCache: Loaded from disk cache (fetched ${this.formatAge(diskSchema.fetchedAt)})`);

            // Background refresh from database
            this.refreshFromDatabase(connectionId);

            return diskSchema;
        }

        // No disk cache - load from database
        const loadPromise = this.fetchFromDatabase(connectionId);

        this.cache.set(connectionId, {
            status: 'loading',
            promise: loadPromise
        });

        try {
            const schema = await loadPromise;
            if (schema) {
                this.cache.set(connectionId, {
                    status: 'ready',
                    schema
                });
                // Save to disk for next startup
                this.saveToDisk(connectionId, schema);
            }
            return schema;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logError(`SchemaCache: Failed to load schema`, error);
            this.cache.set(connectionId, {
                status: 'error',
                error: message
            });
            return null;
        }
    }

    /**
     * Refreshes schema from database in background, replacing disk and memory cache.
     */
    private async refreshFromDatabase(connectionId: ConnectionId): Promise<void> {
        try {
            log(`SchemaCache: Background refresh started`);
            const schema = await this.fetchFromDatabase(connectionId);
            if (schema) {
                this.cache.set(connectionId, {
                    status: 'ready',
                    schema
                });
                await this.saveToDisk(connectionId, schema);
                log(`SchemaCache: Background refresh completed`);
            }
        } catch (error) {
            // Don't update cache state on background refresh failure
            // We still have the disk-cached version
            logError(`SchemaCache: Background refresh failed`, error);
        }
    }

    private async fetchFromDatabase(connectionId: ConnectionId): Promise<CachedSchema | null> {
        log(`SchemaCache: Fetching schema from database for ${connectionId}`);

        const configWithPassword = await this.connectionManager.getConnectionWithPassword(connectionId);
        if (!configWithPassword) {
            log(`SchemaCache: Connection not found`);
            return null;
        }

        const provider = getSchemaProvider(configWithPassword.type);

        // Fetch tables
        const tables = await provider.listTables(this.connectionPool, configWithPassword);
        log(`SchemaCache: Loaded ${tables.length} tables`);

        // Fetch columns for all tables
        const columns = new Map<string, ColumnInfo[]>();
        for (const table of tables) {
            try {
                const tableColumns = await provider.listColumns(
                    this.connectionPool,
                    configWithPassword,
                    table.name
                );
                columns.set(table.name.toLowerCase(), tableColumns);
            } catch (error) {
                logError(`SchemaCache: Failed to load columns for ${table.name}`, error);
                // Continue loading other tables
            }
        }

        log(`SchemaCache: Schema fetched successfully`);

        return {
            connectionId,
            tables,
            columns,
            fetchedAt: Date.now()
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Disk persistence
    // ─────────────────────────────────────────────────────────────────────────

    private getCacheFilePath(connectionId: ConnectionId): vscode.Uri {
        // Use connection ID as filename (UUIDs are filesystem-safe)
        return vscode.Uri.joinPath(this.cacheDir, `${connectionId}.json`);
    }

    private async saveToDisk(connectionId: ConnectionId, schema: CachedSchema): Promise<void> {
        try {
            // Ensure cache directory exists
            await vscode.workspace.fs.createDirectory(this.cacheDir);

            // Convert Map to plain object for JSON serialization
            const serialized: SerializedSchema = {
                connectionId: schema.connectionId,
                tables: schema.tables,
                columns: Object.fromEntries(schema.columns),
                fetchedAt: schema.fetchedAt
            };

            const filePath = this.getCacheFilePath(connectionId);
            const content = Buffer.from(JSON.stringify(serialized, null, 2), 'utf-8');
            await vscode.workspace.fs.writeFile(filePath, content);

            log(`SchemaCache: Saved to disk`);
        } catch (error) {
            logError(`SchemaCache: Failed to save to disk`, error);
        }
    }

    private async loadFromDisk(connectionId: ConnectionId): Promise<CachedSchema | null> {
        try {
            const filePath = this.getCacheFilePath(connectionId);
            const content = await vscode.workspace.fs.readFile(filePath);
            const serialized: SerializedSchema = JSON.parse(Buffer.from(content).toString('utf-8'));

            // Convert plain object back to Map
            const schema: CachedSchema = {
                connectionId: serialized.connectionId,
                tables: serialized.tables,
                columns: new Map(Object.entries(serialized.columns)),
                fetchedAt: serialized.fetchedAt
            };

            return schema;
        } catch {
            // File doesn't exist or is corrupted - that's fine
            return null;
        }
    }

    private formatAge(timestamp: number): string {
        const ageMs = Date.now() - timestamp;
        const minutes = Math.floor(ageMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'just now';
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.cache.clear();
    }
}
