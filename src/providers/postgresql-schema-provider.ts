import { Client as PgClient } from 'pg';
import { ConnectionConfigWithPassword } from '../models/connection';
import { TableInfo, TableType } from '../models/table';
import { ColumnInfo, KeyType } from '../models/column';
import { ConnectionPool, isPostgreSQLClient } from '../connections/connection-pool';
import { SchemaProvider, QueryResult, SortOptions, QueryExecutionOptions, QueryExecutionResult, QueryType } from './schema-provider';

function detectQueryType(sql: string): QueryType {
    const normalized = sql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .toUpperCase();

    if (normalized.startsWith('SELECT') || normalized.startsWith('SHOW') || normalized.startsWith('EXPLAIN')) {
        return 'select';
    }
    if (normalized.startsWith('INSERT')) {
        return 'insert';
    }
    if (normalized.startsWith('UPDATE')) {
        return 'update';
    }
    if (normalized.startsWith('DELETE')) {
        return 'delete';
    }
    if (normalized.startsWith('CREATE') || normalized.startsWith('ALTER') || normalized.startsWith('DROP') || normalized.startsWith('TRUNCATE')) {
        return 'ddl';
    }
    return 'other';
}

function escapeIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
}

export class PostgreSQLSchemaProvider implements SchemaProvider {
    async listTables(pool: ConnectionPool, config: ConnectionConfigWithPassword): Promise<TableInfo[]> {
        const connection = await pool.getConnection(config) as PgClient;

        const result = await connection.query(
            `SELECT table_name, table_type
             FROM information_schema.tables
             WHERE table_schema = 'public'
             ORDER BY table_name`
        );

        return result.rows.map(row => ({
            name: row.table_name,
            type: (row.table_type === 'VIEW' ? 'VIEW' : 'TABLE') as TableType,
            connectionId: config.id,
        }));
    }

    async listColumns(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string
    ): Promise<ColumnInfo[]> {
        const connection = await pool.getConnection(config) as PgClient;

        // Get columns with primary key and foreign key info
        const query = `
            SELECT
                c.column_name,
                c.data_type,
                c.udt_name,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key,
                fk.foreign_table_name,
                fk.foreign_column_name
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = 'public'
                    AND tc.table_name = $1
            ) pk ON c.column_name = pk.column_name
            LEFT JOIN (
                SELECT
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.table_schema = ccu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = 'public'
                    AND tc.table_name = $1
            ) fk ON c.column_name = fk.column_name
            WHERE c.table_schema = 'public'
                AND c.table_name = $1
            ORDER BY c.ordinal_position
        `;

        const result = await connection.query(query, [tableName]);

        return result.rows.map(row => {
            let keyType: KeyType = null;
            if (row.is_primary_key) {
                keyType = 'PRIMARY';
            } else if (row.foreign_table_name) {
                keyType = 'FOREIGN';
            }

            // Use udt_name for more readable types (e.g. "int4" instead of "integer")
            const dataType = row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type;

            return {
                name: row.column_name,
                dataType,
                nullable: row.is_nullable === 'YES',
                keyType,
                defaultValue: row.column_default as string | null,
                foreignKeyRef: row.foreign_table_name ? {
                    table: row.foreign_table_name,
                    column: row.foreign_column_name,
                } : null,
                tableName,
                connectionId: config.id,
            };
        });
    }

    async queryTableData(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string,
        limit: number = 100,
        sort?: SortOptions
    ): Promise<QueryResult> {
        const connection = await pool.getConnection(config) as PgClient;

        const escapedTableName = escapeIdentifier(tableName);
        const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

        let query = `SELECT * FROM ${escapedTableName}`;

        if (sort?.column && sort?.direction) {
            if (sort.direction !== 'ASC' && sort.direction !== 'DESC') {
                throw new Error(`Invalid sort direction: ${sort.direction}`);
            }
            const escapedColumn = escapeIdentifier(sort.column);
            query += ` ORDER BY ${escapedColumn} ${sort.direction}`;
        }

        query += ` LIMIT ${safeLimit}`;

        const result = await connection.query(query);

        const columns = result.fields.map(f => f.name);
        const rows = result.rows.map(row => columns.map(col => row[col]));

        return { columns, rows, query };
    }

    async executeQuery(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        sql: string,
        options: QueryExecutionOptions = {}
    ): Promise<QueryExecutionResult> {
        const {
            limit = 1000,
            timeout = 30000,
            signal,
        } = options;

        const startTime = Date.now();
        const queryType = detectQueryType(sql);
        const connection = await pool.getConnection(config);

        if (!isPostgreSQLClient(connection)) {
            throw new Error('Expected PostgreSQL connection');
        }

        let aborted = false;
        const abortHandler = () => {
            aborted = true;
            // pg supports cancelling queries via the connection
            connection.query('SELECT pg_cancel_backend(pg_backend_pid())').catch(() => {});
        };

        if (signal) {
            if (signal.aborted) {
                throw new Error('Query was cancelled');
            }
            signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
            let actualSql = sql;
            if (queryType === 'select' && !sql.toUpperCase().includes('LIMIT')) {
                actualSql = `${sql.trim().replace(/;$/, '')} LIMIT ${limit + 1}`;
            }

            const result = await Promise.race([
                connection.query(actualSql),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Query timeout')), timeout);
                }),
            ]);

            if (aborted) {
                throw new Error('Query was cancelled');
            }

            const executionTimeMs = Date.now() - startTime;

            if (queryType === 'select' && result.rows) {
                const columns = result.fields?.map(f => f.name) ?? Object.keys(result.rows[0] ?? {});
                const truncated = result.rows.length > limit;
                const actualRows = truncated ? result.rows.slice(0, limit) : result.rows;
                const data = actualRows.map(row => columns.map(col => row[col]));

                return {
                    type: queryType,
                    columns,
                    rows: data,
                    executionTimeMs,
                    truncated,
                    totalRowCount: truncated ? undefined : result.rows.length,
                    query: sql,
                };
            }

            // INSERT/UPDATE/DELETE/DDL
            return {
                type: queryType,
                affectedRows: result.rowCount ?? 0,
                executionTimeMs,
                query: sql,
            };
        } finally {
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
        }
    }
}
