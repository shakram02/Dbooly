import * as mysql from 'mysql2/promise';
import { ConnectionConfigWithPassword, ConnectionId, DatabaseType } from '../models/connection';

export type PooledConnection = mysql.Connection;

export class ConnectionPool {
    private connections: Map<ConnectionId, PooledConnection> = new Map();

    async getConnection(config: ConnectionConfigWithPassword): Promise<PooledConnection> {
        const existing = this.connections.get(config.id);
        if (existing) {
            try {
                await existing.ping();
                return existing;
            } catch {
                this.connections.delete(config.id);
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

        throw new Error(`Unsupported database type: ${config.type}`);
    }

    async closeConnection(connectionId: ConnectionId): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (connection) {
            try {
                await connection.end();
            } catch {
                // Ignore errors on close
            }
            this.connections.delete(connectionId);
        }
    }

    async dispose(): Promise<void> {
        const closePromises = Array.from(this.connections.entries()).map(
            async ([id, conn]) => {
                try {
                    await conn.end();
                } catch {
                    // Ignore errors on close
                }
            }
        );
        await Promise.all(closePromises);
        this.connections.clear();
    }
}
