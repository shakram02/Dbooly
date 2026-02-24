import { Client as PgClient } from 'pg';
import { ConnectionConfigWithPassword } from '../models/connection';
import { TableInfo, TableType } from '../models/table';
import { ColumnInfo, KeyType } from '../models/column';
import { ConnectionPool, isPostgreSQLClient } from '../connections/connection-pool';
import { SchemaProvider, QueryResult, SortOptions, QueryExecutionOptions, QueryExecutionResult, QueryType, UpdateCellResult, InsertRowResult, DeleteRowResult } from './schema-provider';

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
                CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END AS is_unique_key,
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
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'UNIQUE'
                    AND tc.table_schema = 'public'
                    AND tc.table_name = $1
            ) uq ON c.column_name = uq.column_name
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
            } else if (row.is_unique_key && row.is_nullable !== 'YES') {
                keyType = 'UNIQUE';
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

    async updateCell(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        tableName: string,
        primaryKeys: Record<string, unknown>,
        columnName: string,
        newValue: unknown
    ): Promise<UpdateCellResult> {
        try {
            const connection = await pool.getConnection(config) as PgClient;
            const escapedTable = escapeIdentifier(tableName);
            const escapedColumn = escapeIdentifier(columnName);

            const pkEntries = Object.entries(primaryKeys);
            let paramIdx = 1;
            const setClause = `${escapedColumn} = $${paramIdx++}`;
            const whereClauses = pkEntries.map(([key]) => `${escapeIdentifier(key)} = $${paramIdx++}`);
            const params = [newValue, ...pkEntries.map(([, val]) => val)];

            const sql = `UPDATE ${escapedTable} SET ${setClause} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
            const result = await connection.query(sql, params);

            if (result.rows.length > 0) {
                const columns = result.fields.map(f => f.name);
                const updatedRow = columns.map(col => result.rows[0][col]);
                return { success: true, updatedRow };
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
            const connection = await pool.getConnection(config) as PgClient;
            const escapedTable = escapeIdentifier(tableName);

            const entries = Object.entries(values);
            let sql: string;
            let params: unknown[];

            if (entries.length === 0) {
                sql = `INSERT INTO ${escapedTable} DEFAULT VALUES RETURNING *`;
                params = [];
            } else {
                const columns = entries.map(([key]) => escapeIdentifier(key));
                const placeholders = entries.map((_, i) => `$${i + 1}`);
                params = entries.map(([, val]) => val);
                sql = `INSERT INTO ${escapedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
            }

            const result = await connection.query(sql, params);

            if (result.rows.length > 0) {
                const columns = result.fields.map(f => f.name);
                return { success: true, newRow: columns.map(col => result.rows[0][col]) };
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
            const connection = await pool.getConnection(config) as PgClient;
            const escapedTable = escapeIdentifier(tableName);

            const pkEntries = Object.entries(primaryKeys);
            const whereClauses = pkEntries.map(([key], i) => `${escapeIdentifier(key)} = $${i + 1}`);
            const params = pkEntries.map(([, val]) => val);

            const sql = `DELETE FROM ${escapedTable} WHERE ${whereClauses.join(' AND ')}`;
            await connection.query(sql, params);

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
        const connection = await pool.getConnection(config) as PgClient;
        const qualifiedName = `public.${escapeIdentifier(tableName)}`;

        // Query 1: Columns — name, type, nullability, defaults
        const columnsResult = await connection.query(
            `SELECT
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null,
                pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_value
            FROM pg_catalog.pg_attribute a
            LEFT JOIN pg_catalog.pg_attrdef d
                ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            WHERE a.attrelid = $1::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
            ORDER BY a.attnum`,
            [qualifiedName]
        );

        if (columnsResult.rows.length === 0) {
            throw new Error(`Table "${tableName}" not found or has no columns`);
        }

        // Query 2: Constraints — PK, UNIQUE, FK, CHECK
        const constraintsResult = await connection.query(
            `SELECT
                conname AS constraint_name,
                pg_catalog.pg_get_constraintdef(c.oid, true) AS constraint_def
            FROM pg_catalog.pg_constraint c
            WHERE c.conrelid = $1::regclass
            ORDER BY
                CASE c.contype
                    WHEN 'p' THEN 0
                    WHEN 'u' THEN 1
                    WHEN 'f' THEN 2
                    WHEN 'c' THEN 3
                    ELSE 4
                END`,
            [qualifiedName]
        );

        // Assemble DDL
        const parts: string[] = [];

        for (const row of columnsResult.rows) {
            let colDef = `    ${escapeIdentifier(row.column_name)} ${row.data_type}`;
            if (row.not_null) {
                colDef += ' NOT NULL';
            }
            if (row.default_value !== null) {
                colDef += ` DEFAULT ${row.default_value}`;
            }
            parts.push(colDef);
        }

        for (const row of constraintsResult.rows) {
            parts.push(`    CONSTRAINT ${escapeIdentifier(row.constraint_name)} ${row.constraint_def}`);
        }

        return `CREATE TABLE ${escapeIdentifier(tableName)} (\n${parts.join(',\n')}\n);`;
    }
}
