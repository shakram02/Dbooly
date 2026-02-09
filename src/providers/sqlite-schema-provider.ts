import { Database as SqlJsDatabase } from 'sql.js';
import { ConnectionConfigWithPassword } from '../models/connection';
import { TableInfo, TableType } from '../models/table';
import { ColumnInfo, KeyType } from '../models/column';
import { ConnectionPool } from '../connections/connection-pool';
import { SchemaProvider, QueryResult, SortOptions, QueryExecutionOptions, QueryExecutionResult, QueryType } from './schema-provider';

/**
 * Detects the type of SQL query from the SQL string.
 */
function detectQueryType(sql: string): QueryType {
    const normalized = sql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .toUpperCase();

    if (normalized.startsWith('SELECT') || normalized.startsWith('PRAGMA') || normalized.startsWith('EXPLAIN')) {
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

/**
 * Helper to convert sql.js exec results to array of objects
 */
function execToObjects<T>(db: SqlJsDatabase, sql: string): T[] {
    const result = db.exec(sql);
    if (result.length === 0) {
        return [];
    }

    const { columns, values } = result[0];
    return values.map((row: (string | number | Uint8Array | null)[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
        });
        return obj as T;
    });
}

export class SQLiteSchemaProvider implements SchemaProvider {
    async listTables(pool: ConnectionPool, config: ConnectionConfigWithPassword): Promise<TableInfo[]> {
        const db = await pool.getConnection(config) as SqlJsDatabase;

        const rows = execToObjects<{ name: string; type: string }>(db, `
            SELECT name, type
            FROM sqlite_master
            WHERE type IN ('table', 'view')
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);

        return rows.map(row => ({
            name: row.name,
            type: row.type.toUpperCase() === 'VIEW' ? 'VIEW' : 'TABLE' as TableType,
            connectionId: config.id,
        }));
    }

    async listColumns(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string
    ): Promise<ColumnInfo[]> {
        const db = await pool.getConnection(config) as SqlJsDatabase;

        // Escape table name for PRAGMA (use double quotes)
        const escapedTableName = tableName.replace(/"/g, '""');

        // Get column info using PRAGMA
        const columns = execToObjects<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }>(db, `PRAGMA table_info("${escapedTableName}")`);

        // Get foreign keys for this table
        const foreignKeys = execToObjects<{
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
        }>(db, `PRAGMA foreign_key_list("${escapedTableName}")`);

        const fkMap = new Map<string, { table: string; column: string }>();
        for (const fk of foreignKeys) {
            fkMap.set(fk.from, { table: fk.table, column: fk.to });
        }

        return columns.map(col => {
            let keyType: KeyType = null;
            if (col.pk > 0) {
                keyType = 'PRIMARY';
            } else if (fkMap.has(col.name)) {
                keyType = 'FOREIGN';
            }

            return {
                name: col.name,
                dataType: col.type || 'BLOB', // SQLite allows empty type
                nullable: col.notnull === 0,
                keyType,
                defaultValue: col.dflt_value,
                foreignKeyRef: fkMap.get(col.name) || null,
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
        const db = await pool.getConnection(config) as SqlJsDatabase;

        // Use double quotes for identifier escaping in SQLite
        const escapedTableName = `"${tableName.replace(/"/g, '""')}"`;
        const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

        let query = `SELECT * FROM ${escapedTableName}`;

        if (sort?.column && sort?.direction) {
            if (sort.direction !== 'ASC' && sort.direction !== 'DESC') {
                throw new Error(`Invalid sort direction: ${sort.direction}`);
            }
            const escapedColumn = `"${sort.column.replace(/"/g, '""')}"`;
            query += ` ORDER BY ${escapedColumn} ${sort.direction}`;
        }

        query += ` LIMIT ${safeLimit}`;

        const result = db.exec(query);

        if (result.length === 0) {
            return { columns: [], rows: [], query };
        }

        const { columns, values } = result[0];
        return { columns, rows: values as unknown[][], query };
    }

    async executeQuery(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        sql: string,
        options: QueryExecutionOptions = {}
    ): Promise<QueryExecutionResult> {
        const { limit = 1000 } = options;

        const startTime = Date.now();
        const queryType = detectQueryType(sql);
        const db = await pool.getConnection(config) as SqlJsDatabase;

        if (queryType === 'select') {
            // Add LIMIT if not present
            let actualSql = sql;
            if (!sql.toUpperCase().includes('LIMIT')) {
                actualSql = `${sql.trim().replace(/;$/, '')} LIMIT ${limit + 1}`;
            }

            const result = db.exec(actualSql);
            const executionTimeMs = Date.now() - startTime;

            if (result.length === 0) {
                return {
                    type: queryType,
                    columns: [],
                    rows: [],
                    executionTimeMs,
                    truncated: false,
                    totalRowCount: 0,
                    query: sql,
                };
            }

            const { columns, values } = result[0];
            const truncated = values.length > limit;
            const actualRows = truncated ? values.slice(0, limit) : values;

            return {
                type: queryType,
                columns,
                rows: actualRows as unknown[][],
                executionTimeMs,
                truncated,
                totalRowCount: truncated ? undefined : values.length,
                query: sql,
            };
        }

        // Non-SELECT queries (INSERT/UPDATE/DELETE/DDL)
        db.run(sql);
        const executionTimeMs = Date.now() - startTime;

        // sql.js doesn't provide affected rows count directly
        // We can get it from changes() but need to call it right after
        const changesResult = db.exec('SELECT changes()');
        const affectedRows = changesResult.length > 0 ? (changesResult[0].values[0][0] as number) : 0;

        return {
            type: queryType,
            affectedRows,
            executionTimeMs,
            query: sql,
        };
    }
}
