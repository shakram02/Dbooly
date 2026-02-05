import { ConnectionConfigWithPassword, DatabaseType } from '../models/connection';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { ConnectionPool } from '../connections/connection-pool';
import { MySQLSchemaProvider } from './mysql-schema-provider';

export interface QueryResult {
    columns: string[];
    rows: unknown[][];
    query: string;
}

export type SortDirection = 'ASC' | 'DESC' | null;

export interface SortOptions {
    column: string;
    direction: SortDirection;
}

export type QueryType = 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'other';

export interface QueryExecutionOptions {
    /** Maximum number of rows to return (default: 1000) */
    limit?: number;
    /** Query timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Transaction mode: 'auto' commits immediately, 'manual' requires explicit commit */
    transactionMode?: 'auto' | 'manual';
    /** AbortSignal for query cancellation */
    signal?: AbortSignal;
}

export interface QueryExecutionResult {
    /** The type of query that was executed */
    type: QueryType;
    /** Column names for SELECT queries */
    columns?: string[];
    /** Row data for SELECT queries */
    rows?: unknown[][];
    /** Number of affected rows for INSERT/UPDATE/DELETE */
    affectedRows?: number;
    /** Query execution time in milliseconds */
    executionTimeMs: number;
    /** True if results were truncated due to limit */
    truncated?: boolean;
    /** Total row count if available from database */
    totalRowCount?: number;
    /** The executed SQL query */
    query: string;
}

export interface SchemaProvider {
    listTables(pool: ConnectionPool, config: ConnectionConfigWithPassword): Promise<TableInfo[]>;
    listColumns(pool: ConnectionPool, config: ConnectionConfigWithPassword, tableName: string): Promise<ColumnInfo[]>;
    queryTableData(pool: ConnectionPool, config: ConnectionConfigWithPassword, tableName: string, limit?: number, sort?: SortOptions): Promise<QueryResult>;
    /** Execute arbitrary SQL query with optional execution options */
    executeQuery(pool: ConnectionPool, config: ConnectionConfigWithPassword, sql: string, options?: QueryExecutionOptions): Promise<QueryExecutionResult>;
}

const providers: Record<DatabaseType, SchemaProvider> = {
    mysql: new MySQLSchemaProvider(),
};

export function getSchemaProvider(type: DatabaseType): SchemaProvider {
    const provider = providers[type];
    if (!provider) {
        throw new Error(`No schema provider for database type: ${type}`);
    }
    return provider;
}
