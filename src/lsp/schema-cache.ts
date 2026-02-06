import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConnectionConfigWithPassword, ConnectionId } from '../models/connection';
import { ConnectionPool } from '../connections/connection-pool';
import { getSchemaProvider } from '../providers/schema-provider';
import { log, logError } from '../logger';

/**
 * Schema format expected by sql-language-server when using adapter: 'json'
 */
interface SqlLsSchema {
    tables: SqlLsTable[];
    functions?: SqlLsFunction[];
}

interface SqlLsTable {
    catalog: string | null;
    database: string;
    tableName: string;
    columns: SqlLsColumn[];
}

interface SqlLsColumn {
    columnName: string;
    description: string;
}

interface SqlLsFunction {
    name: string;
    description?: string;
}

interface CacheMetadata {
    connectionId: string;
    database: string;
    host: string;
    port: number;
    cachedAt: string;
    tableCount: number;
}

/**
 * Manages schema caching for sql-language-server.
 *
 * Caches schema to JSON files so the LSP can load instantly on startup,
 * then refreshes in background.
 */
export class SchemaCache {
    private readonly cacheDir: string;
    private refreshInProgress = new Map<ConnectionId, boolean>();

    constructor() {
        // Store cache in user's config directory
        this.cacheDir = path.join(os.homedir(), '.config', 'dbooly', 'schema-cache');
        this.ensureCacheDir();
    }

    private ensureCacheDir(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Gets the path to the cached schema file for a connection.
     */
    getSchemaFilePath(connectionId: ConnectionId): string {
        // Sanitize connection ID to be filesystem-safe
        const safeId = connectionId.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.cacheDir, `${safeId}.json`);
    }

    /**
     * Checks if a cached schema exists and is valid.
     */
    hasCachedSchema(connectionId: ConnectionId): boolean {
        const filePath = this.getSchemaFilePath(connectionId);
        return fs.existsSync(filePath);
    }

    /**
     * Gets the cache metadata (without loading full schema).
     */
    getCacheMetadata(connectionId: ConnectionId): CacheMetadata | null {
        const metaPath = this.getMetadataPath(connectionId);
        if (!fs.existsSync(metaPath)) {
            return null;
        }
        try {
            const data = fs.readFileSync(metaPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    private getMetadataPath(connectionId: ConnectionId): string {
        const safeId = connectionId.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.cacheDir, `${safeId}.meta.json`);
    }

    /**
     * Fetches schema from database and saves to cache.
     * Returns the path to the cached schema file.
     */
    async refreshSchema(
        connectionId: ConnectionId,
        config: ConnectionConfigWithPassword,
        pool: ConnectionPool
    ): Promise<string> {
        if (this.refreshInProgress.get(connectionId)) {
            log(`SchemaCache: Refresh already in progress for ${config.name}`);
            return this.getSchemaFilePath(connectionId);
        }

        this.refreshInProgress.set(connectionId, true);
        const startTime = Date.now();

        try {
            log(`SchemaCache: Refreshing schema for ${config.name}...`);

            const provider = getSchemaProvider(config.type);

            // Fetch all tables
            const tables = await provider.listTables(pool, config);
            log(`SchemaCache: Found ${tables.length} tables`);

            // Fetch columns for each table (in parallel batches to avoid overwhelming DB)
            const sqlLsTables: SqlLsTable[] = [];
            const batchSize = 10;

            for (let i = 0; i < tables.length; i += batchSize) {
                const batch = tables.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(async (table) => {
                        try {
                            const columns = await provider.listColumns(pool, config, table.name);
                            return {
                                catalog: null,
                                database: config.database,
                                tableName: table.name,
                                columns: columns.map(col => ({
                                    columnName: col.name,
                                    description: `${col.name}(Type: ${col.dataType}, Null: ${col.nullable ? 'YES' : 'NO'}, Default: ${col.defaultValue ?? 'null'})`
                                }))
                            };
                        } catch (err) {
                            logError(`SchemaCache: Failed to get columns for ${table.name}`, err);
                            return {
                                catalog: null,
                                database: config.database,
                                tableName: table.name,
                                columns: []
                            };
                        }
                    })
                );
                sqlLsTables.push(...batchResults);
            }

            const schema: SqlLsSchema = {
                tables: sqlLsTables,
                functions: [] // Could add built-in functions here
            };

            // Save schema to file
            const schemaPath = this.getSchemaFilePath(connectionId);
            fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

            // Save metadata
            const metadata: CacheMetadata = {
                connectionId,
                database: config.database,
                host: config.host,
                port: config.port,
                cachedAt: new Date().toISOString(),
                tableCount: tables.length
            };
            fs.writeFileSync(this.getMetadataPath(connectionId), JSON.stringify(metadata, null, 2));

            const elapsed = Date.now() - startTime;
            log(`SchemaCache: Cached ${tables.length} tables in ${elapsed}ms -> ${schemaPath}`);

            return schemaPath;
        } catch (error) {
            logError('SchemaCache: Failed to refresh schema', error);
            throw error;
        } finally {
            this.refreshInProgress.set(connectionId, false);
        }
    }

    /**
     * Starts a background refresh of the schema.
     * Does not block - returns immediately.
     */
    refreshSchemaInBackground(
        connectionId: ConnectionId,
        config: ConnectionConfigWithPassword,
        pool: ConnectionPool
    ): void {
        // Fire and forget
        this.refreshSchema(connectionId, config, pool).catch(err => {
            logError('SchemaCache: Background refresh failed', err);
        });
    }

    /**
     * Clears the cached schema for a connection.
     */
    clearCache(connectionId: ConnectionId): void {
        const schemaPath = this.getSchemaFilePath(connectionId);
        const metaPath = this.getMetadataPath(connectionId);

        if (fs.existsSync(schemaPath)) {
            fs.unlinkSync(schemaPath);
        }
        if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
        }
        log(`SchemaCache: Cleared cache for ${connectionId}`);
    }
}
