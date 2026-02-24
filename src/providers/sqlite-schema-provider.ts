import { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import { ConnectionConfigWithPassword } from '../models/connection';
import { TableInfo, TableType } from '../models/table';
import { ColumnInfo, KeyType } from '../models/column';
import { ConnectionPool } from '../connections/connection-pool';
import { SchemaProvider, QueryResult, SortOptions, QueryExecutionOptions, QueryExecutionResult, QueryType, UpdateCellResult, InsertRowResult, DeleteRowResult } from './schema-provider';

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

        // Get unique indexes to detect UNIQUE NOT NULL columns
        const indexes = execToObjects<{
            seq: number;
            name: string;
            unique: number;
            origin: string;
            partial: number;
        }>(db, `PRAGMA index_list("${escapedTableName}")`);

        const uniqueColumns = new Set<string>();
        for (const idx of indexes) {
            if (idx.unique === 1 && idx.origin !== 'pk') {
                const indexInfo = execToObjects<{
                    seqno: number;
                    cid: number;
                    name: string;
                }>(db, `PRAGMA index_info("${idx.name.replace(/"/g, '""')}")`);

                for (const col of indexInfo) {
                    // Only mark as UNIQUE if the column is NOT NULL
                    const colInfo = columns.find(c => c.name === col.name);
                    if (colInfo && colInfo.notnull === 1) {
                        uniqueColumns.add(col.name);
                    }
                }
            }
        }

        return columns.map(col => {
            let keyType: KeyType = null;
            if (col.pk > 0) {
                keyType = 'PRIMARY';
            } else if (fkMap.has(col.name)) {
                keyType = 'FOREIGN';
            } else if (uniqueColumns.has(col.name)) {
                keyType = 'UNIQUE';
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

    async updateCell(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string,
        primaryKeys: Record<string, unknown>,
        columnName: string,
        newValue: unknown
    ): Promise<UpdateCellResult> {
        try {
            const db = await pool.getConnection(config) as SqlJsDatabase;
            const escapedTable = `"${tableName.replace(/"/g, '""')}"`;
            const escapedColumn = `"${columnName.replace(/"/g, '""')}"`;

            const pkEntries = Object.entries(primaryKeys);
            const whereClauses = pkEntries.map(([key]) => `"${key.replace(/"/g, '""')}" = ?`);
            const params = [newValue, ...pkEntries.map(([, val]) => val)];

            const updateSql = `UPDATE ${escapedTable} SET ${escapedColumn} = ? WHERE ${whereClauses.join(' AND ')}`;
            db.run(updateSql, params as SqlValue[]);

            // Re-fetch the updated row
            const selectPkValues = pkEntries.map(([key, val]) => key === columnName ? newValue : val);
            const selectQuery = `SELECT * FROM ${escapedTable} WHERE ${whereClauses.join(' AND ')}`;
            const result = db.exec(selectQuery, selectPkValues as SqlValue[]);

            await pool.saveSQLiteDatabase(config.id);

            if (result.length > 0 && result[0].values.length > 0) {
                return { success: true, updatedRow: result[0].values[0] as unknown[] };
            }

            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    async insertRow(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string,
        values: Record<string, unknown>
    ): Promise<InsertRowResult> {
        try {
            const db = await pool.getConnection(config) as SqlJsDatabase;
            const escapedTable = `"${tableName.replace(/"/g, '""')}"`;

            const entries = Object.entries(values);
            let insertSql: string;
            let params: unknown[];

            if (entries.length === 0) {
                insertSql = `INSERT INTO ${escapedTable} DEFAULT VALUES`;
                params = [];
            } else {
                const columns = entries.map(([key]) => `"${key.replace(/"/g, '""')}"`);
                const placeholders = entries.map(() => '?');
                params = entries.map(([, val]) => val);
                insertSql = `INSERT INTO ${escapedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
            }

            db.run(insertSql, params as SqlValue[]);

            // Get the new row via last_insert_rowid()
            const result = db.exec(`SELECT * FROM ${escapedTable} WHERE rowid = last_insert_rowid()`);

            await pool.saveSQLiteDatabase(config.id);

            if (result.length > 0 && result[0].values.length > 0) {
                return { success: true, newRow: result[0].values[0] as unknown[] };
            }

            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    async deleteRow(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string,
        primaryKeys: Record<string, unknown>
    ): Promise<DeleteRowResult> {
        try {
            const db = await pool.getConnection(config) as SqlJsDatabase;
            const escapedTable = `"${tableName.replace(/"/g, '""')}"`;

            const pkEntries = Object.entries(primaryKeys);
            const whereClauses = pkEntries.map(([key]) => `"${key.replace(/"/g, '""')}" = ?`);
            const params = pkEntries.map(([, val]) => val);

            const deleteSql = `DELETE FROM ${escapedTable} WHERE ${whereClauses.join(' AND ')}`;
            db.run(deleteSql, params as SqlValue[]);

            await pool.saveSQLiteDatabase(config.id);

            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    async getTableDDL(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string
    ): Promise<string> {
        const db = await pool.getConnection(config) as SqlJsDatabase;
        const result = db.exec(
            `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
            [tableName]
        );
        if (result.length === 0 || result[0].values.length === 0 || !result[0].values[0][0]) {
            throw new Error(`Table "${tableName}" not found`);
        }
        const ddl = result[0].values[0][0] as string;
        return ddl.endsWith(';') ? ddl : ddl + ';';
    }
}
