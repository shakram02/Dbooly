import { ConnectionConfigWithPassword } from '../models/connection';
import { TableInfo, TableType } from '../models/table';
import { ColumnInfo, KeyType } from '../models/column';
import { ConnectionPool } from '../connections/connection-pool';
import { SchemaProvider, QueryResult, SortOptions, QueryExecutionOptions, QueryExecutionResult, QueryType } from './schema-provider';
import { FieldPacket, ResultSetHeader } from 'mysql2/promise';

/**
 * Detects the type of SQL query from the SQL string.
 */
function detectQueryType(sql: string): QueryType {
    // Normalize: remove comments and extra whitespace
    const normalized = sql
        .replace(/--.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .trim()
        .toUpperCase();

    if (normalized.startsWith('SELECT') || normalized.startsWith('SHOW') || normalized.startsWith('DESCRIBE') || normalized.startsWith('EXPLAIN')) {
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

export class MySQLSchemaProvider implements SchemaProvider {
    async listTables(pool: ConnectionPool, config: ConnectionConfigWithPassword): Promise<TableInfo[]> {
        const connection = await pool.getConnection(config);

        const [rows] = await connection.query('SHOW FULL TABLES');

        const tables: TableInfo[] = (rows as Array<Record<string, string>>).map(row => {
            const values = Object.values(row);
            const name = values[0];
            const tableType = values[1];

            return {
                name,
                type: tableType === 'VIEW' ? 'VIEW' : 'TABLE' as TableType,
                connectionId: config.id,
            };
        });

        return tables;
    }

    async listColumns(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string
    ): Promise<ColumnInfo[]> {
        const connection = await pool.getConnection(config);

        // Single query to get columns with key information
        const query = `
            SELECT
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.COLUMN_TYPE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                c.COLUMN_KEY,
                k.REFERENCED_TABLE_NAME,
                k.REFERENCED_COLUMN_NAME
            FROM information_schema.COLUMNS c
            LEFT JOIN information_schema.KEY_COLUMN_USAGE k
                ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
                AND c.TABLE_NAME = k.TABLE_NAME
                AND c.COLUMN_NAME = k.COLUMN_NAME
                AND k.REFERENCED_TABLE_NAME IS NOT NULL
            WHERE c.TABLE_SCHEMA = DATABASE()
                AND c.TABLE_NAME = ?
            ORDER BY c.ORDINAL_POSITION
        `;

        const [rows] = await connection.query(query, [tableName]);

        return (rows as Array<Record<string, unknown>>).map(row => {
            let keyType: KeyType = null;
            if (row.COLUMN_KEY === 'PRI') {
                keyType = 'PRIMARY';
            } else if (row.REFERENCED_TABLE_NAME) {
                keyType = 'FOREIGN';
            }

            return {
                name: row.COLUMN_NAME as string,
                dataType: row.COLUMN_TYPE as string,
                nullable: row.IS_NULLABLE === 'YES',
                keyType,
                defaultValue: row.COLUMN_DEFAULT as string | null,
                foreignKeyRef: row.REFERENCED_TABLE_NAME ? {
                    table: row.REFERENCED_TABLE_NAME as string,
                    column: row.REFERENCED_COLUMN_NAME as string,
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
        const connection = await pool.getConnection(config);

        // Table names are identifiers - can't use parameterized queries (?)
        // Use backtick escaping with internal backticks doubled
        const escapedTableName = '`' + tableName.replace(/`/g, '``') + '`';
        const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

        let query = `SELECT * FROM ${escapedTableName}`;

        // Add ORDER BY clause if sort is specified
        if (sort?.column && sort?.direction) {
            // Validate direction is exactly ASC or DESC (whitelist)
            if (sort.direction !== 'ASC' && sort.direction !== 'DESC') {
                throw new Error(`Invalid sort direction: ${sort.direction}`);
            }
            // Escape column name using backticks with internal backticks doubled
            const escapedColumn = '`' + sort.column.replace(/`/g, '``') + '`';
            query += ` ORDER BY ${escapedColumn} ${sort.direction}`;
        }

        query += ` LIMIT ${safeLimit}`;

        const [rows, fields] = await connection.query(query) as [unknown[], FieldPacket[]];

        const columns = fields.map(field => field.name);
        const data = (rows as Array<Record<string, unknown>>).map(row =>
            columns.map(col => row[col])
        );

        return { columns, rows: data, query };
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

        // Setup abort handling
        let aborted = false;
        const abortHandler = () => {
            aborted = true;
            // MySQL: destroy connection to cancel query
            // Note: This is a forceful cancellation - the connection will be removed from the pool
            connection.destroy();
        };

        if (signal) {
            if (signal.aborted) {
                throw new Error('Query was cancelled');
            }
            signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
            // For SELECT queries, we may want to limit results
            let actualSql = sql;
            if (queryType === 'select' && !sql.toUpperCase().includes('LIMIT')) {
                // Add LIMIT clause if not present (to prevent fetching millions of rows)
                actualSql = `${sql.trim().replace(/;$/, '')} LIMIT ${limit + 1}`;
            }

            const [result, fields] = await Promise.race([
                connection.query(actualSql),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Query timeout')), timeout);
                }),
            ]) as [unknown, FieldPacket[] | undefined];

            if (aborted) {
                throw new Error('Query was cancelled');
            }

            const executionTimeMs = Date.now() - startTime;

            // Handle SELECT queries
            if (queryType === 'select' && Array.isArray(result)) {
                const rows = result as Array<Record<string, unknown>>;
                const columns = fields?.map(f => f.name) ?? Object.keys(rows[0] ?? {});

                // Check if results were truncated
                const truncated = rows.length > limit;
                const actualRows = truncated ? rows.slice(0, limit) : rows;

                // Convert rows to array format
                const data = actualRows.map(row => columns.map(col => row[col]));

                return {
                    type: queryType,
                    columns,
                    rows: data,
                    executionTimeMs,
                    truncated,
                    totalRowCount: truncated ? undefined : rows.length,
                    query: sql,
                };
            }

            // Handle INSERT/UPDATE/DELETE queries
            if (queryType === 'insert' || queryType === 'update' || queryType === 'delete' || queryType === 'ddl' || queryType === 'other') {
                const resultHeader = result as ResultSetHeader;
                return {
                    type: queryType,
                    affectedRows: resultHeader.affectedRows,
                    executionTimeMs,
                    query: sql,
                };
            }

            // Fallback
            return {
                type: queryType,
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
