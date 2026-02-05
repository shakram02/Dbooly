import * as mysql from 'mysql2/promise';
import { ConnectionConfigWithPassword } from '../models/connection';

export interface TestResult {
    success: boolean;
    message: string;
}

type TestableConfig = Omit<ConnectionConfigWithPassword, 'id'>;

export async function testConnection(config: TestableConfig): Promise<TestResult> {
    if (config.type === 'mysql') {
        return testMySQLConnection(config);
    }
    return { success: false, message: `Unsupported database type: ${config.type}` };
}

async function testMySQLConnection(config: TestableConfig): Promise<TestResult> {
    let connection: mysql.Connection | undefined;

    try {
        connection = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectTimeout: 10000,
        });

        await connection.ping();

        return { success: true, message: 'Connection successful' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, message: `Connection failed: ${message}` };
    } finally {
        if (connection) {
            await connection.end().catch(() => {});
        }
    }
}
