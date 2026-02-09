import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import { ConnectionConfigWithPassword, MySQLConnectionConfigWithPassword, SQLiteConnectionConfigWithPassword } from '../models/connection';
import { getSqlJs } from './sql-js-loader';

export interface TestResult {
    success: boolean;
    message: string;
}

type TestableConfig = Omit<ConnectionConfigWithPassword, 'id'>;
type TestableMySQLConfig = Omit<MySQLConnectionConfigWithPassword, 'id'>;
type TestableSQLiteConfig = Omit<SQLiteConnectionConfigWithPassword, 'id'>;

export async function testConnection(config: TestableConfig): Promise<TestResult> {
    if (config.type === 'mysql') {
        return testMySQLConnection(config as TestableMySQLConfig);
    }
    if (config.type === 'sqlite') {
        return testSQLiteConnection(config as TestableSQLiteConfig);
    }
    return { success: false, message: `Unsupported database type: ${(config as { type: string }).type}` };
}

async function testMySQLConnection(config: TestableMySQLConfig): Promise<TestResult> {
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

async function testSQLiteConnection(config: TestableSQLiteConfig): Promise<TestResult> {
    try {
        // Check if file exists
        if (!fs.existsSync(config.filePath)) {
            return { success: false, message: `Connection failed: Database file not found: ${config.filePath}` };
        }

        // Initialize sql.js using shared loader
        const SQL = await getSqlJs();

        // Read the database file
        const fileBuffer = fs.readFileSync(config.filePath);
        const db = new SQL.Database(fileBuffer);

        // Run a simple query to verify the database is valid
        db.exec('SELECT 1');

        // Clean up
        db.close();

        return { success: true, message: 'Connection successful' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, message: `Connection failed: ${message}` };
    }
}
