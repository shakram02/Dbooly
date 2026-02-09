import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import { Database as SqlJsDatabase } from 'sql.js';
import { ConnectionConfigWithPassword, ConnectionId } from '../models/connection';
import { getSqlJs } from './sql-js-loader';

// Re-export setSqlJsWasmPath for convenience
export { setSqlJsWasmPath } from './sql-js-loader';

export type PooledConnection = mysql.Connection | SqlJsDatabase;

// Type guard to check if connection is SQLite (sql.js)
export function isSQLiteDatabase(conn: PooledConnection): conn is SqlJsDatabase {
    return 'exec' in conn && 'run' in conn && !('ping' in conn);
}

export class ConnectionPool {
    private connections: Map<ConnectionId, PooledConnection> = new Map();
    // Store file paths for SQLite connections to enable saving
    private sqliteFilePaths: Map<ConnectionId, string> = new Map();

    async getConnection(config: ConnectionConfigWithPassword): Promise<PooledConnection> {
        const existing = this.connections.get(config.id);
        if (existing) {
            try {
                // Health check differs by database type
                if (isSQLiteDatabase(existing)) {
                    // SQLite: run a simple query to check connection
                    existing.exec('SELECT 1');
                } else {
                    // MySQL: use ping
                    await existing.ping();
                }
                return existing;
            } catch {
                this.connections.delete(config.id);
                this.sqliteFilePaths.delete(config.id);
            }
        }

        const connection = await this.createConnection(config);
        this.connections.set(config.id, connection);
        return connection;
    }

    private async createConnection(config: ConnectionConfigWithPassword): Promise<PooledConnection> {
        if (config.type === 'mysql') {
            return mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.username,
                password: config.password,
                database: config.database,
                connectTimeout: 10000,
            });
        }

        if (config.type === 'sqlite') {
            const SQL = await getSqlJs();

            // Read the database file
            if (!fs.existsSync(config.filePath)) {
                throw new Error(`Database file not found: ${config.filePath}`);
            }

            const fileBuffer = fs.readFileSync(config.filePath);
            const db = new SQL.Database(fileBuffer);

            // Enable foreign keys (disabled by default in SQLite)
            db.run('PRAGMA foreign_keys = ON');

            // Store the file path for potential saving later
            this.sqliteFilePaths.set(config.id, config.filePath);

            return db;
        }

        throw new Error(`Unsupported database type: ${(config as { type: string }).type}`);
    }

    // Save SQLite database changes back to file
    async saveSQLiteDatabase(connectionId: ConnectionId): Promise<void> {
        const connection = this.connections.get(connectionId);
        const filePath = this.sqliteFilePaths.get(connectionId);

        if (connection && isSQLiteDatabase(connection) && filePath) {
            const data = connection.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(filePath, buffer);
        }
    }

    async closeConnection(connectionId: ConnectionId): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (connection) {
            try {
                if (isSQLiteDatabase(connection)) {
                    // Save any pending changes before closing
                    await this.saveSQLiteDatabase(connectionId);
                    connection.close();
                } else {
                    await connection.end();
                }
            } catch {
                // Ignore errors on close
            }
            this.connections.delete(connectionId);
            this.sqliteFilePaths.delete(connectionId);
        }
    }

    async dispose(): Promise<void> {
        const closePromises = Array.from(this.connections.entries()).map(
            async ([id, conn]) => {
                try {
                    if (isSQLiteDatabase(conn)) {
                        await this.saveSQLiteDatabase(id);
                        conn.close();
                    } else {
                        await conn.end();
                    }
                } catch {
                    // Ignore errors on close
                }
            }
        );
        await Promise.all(closePromises);
        this.connections.clear();
        this.sqliteFilePaths.clear();
    }
}
