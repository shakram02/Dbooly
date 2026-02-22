## 1. Core Type Updates
- [x] 1.1 Add `'postgresql'` to `DatabaseType` union in `src/models/connection.ts`
- [x] 1.2 Create `PostgreSQLConnectionConfig` interface with host, port, database, username, ssl fields
- [x] 1.3 Create `PostgreSQLConnectionConfigWithPassword` interface
- [x] 1.4 Add `isPostgreSQLConnection` type guard function
- [x] 1.5 Update `ConnectionConfig` and `ConnectionConfigWithPassword` unions

## 2. Dependencies
- [x] 2.1 Add `pg` to dependencies in `package.json`
- [x] 2.2 Add `@types/pg` to devDependencies

## 3. PostgreSQL Schema Provider
- [x] 3.1 Create `src/providers/postgresql-schema-provider.ts`
- [x] 3.2 Implement `listTables` using `information_schema.tables` (filtered to public schema)
- [x] 3.3 Implement `listColumns` using `information_schema.columns`
- [x] 3.4 Implement primary key detection via `information_schema.table_constraints` and `key_column_usage`
- [x] 3.5 Implement foreign key detection via `information_schema.referential_constraints` and `key_column_usage`
- [x] 3.6 Implement `queryTableData` with double-quote identifier escaping
- [x] 3.7 Implement `executeQuery` with query type detection and `$N` parameterized queries
- [x] 3.8 Register provider in `src/providers/schema-provider.ts`

## 4. Connection Pool Updates
- [x] 4.1 Add `pg` import to `src/connections/connection-pool.ts`
- [x] 4.2 Update `PooledConnection` type to support pg.Client
- [x] 4.3 Handle PostgreSQL connection creation in `createConnection` (with SSL support)
- [x] 4.4 Handle PostgreSQL connection closing in `closeConnection`
- [x] 4.5 Update health check to work with PostgreSQL (use `SELECT 1`)

## 5. Connection Form UI
- [x] 5.1 Add PostgreSQL option to database type selector in `src/connections/connection-form.ts`
- [x] 5.2 Add SSL toggle field to the form
- [x] 5.3 Default port to 5432 when PostgreSQL is selected (consistent with MySQL defaulting to 3306)
- [x] 5.4 Show/hide fields based on selected database type (same fields as MySQL plus SSL)
- [x] 5.5 Update form data collection for PostgreSQL connections

## 6. Connection Testing
- [x] 6.1 Add `testPostgreSQLConnection` function in `src/connections/connection-tester.ts`
- [x] 6.2 Test connection using `SELECT 1` query
- [x] 6.3 Handle SSL-specific connection errors with helpful messages

## 7. Display Updates
- [x] 7.1 Update connection tree tooltip for PostgreSQL (show host:port/database)
- [x] 7.2 Update quick pick descriptions in `src/connections/connection-commands.ts`

## 8. Verification
- [x] 8.1 Build extension without errors
- [ ] 8.2 Test adding PostgreSQL connection via form
- [ ] 8.3 Test connection testing for PostgreSQL
- [ ] 8.4 Test browsing tables in PostgreSQL database
- [ ] 8.5 Test viewing table columns with key indicators
- [ ] 8.6 Test querying table data
- [ ] 8.7 Test executing custom SQL queries
- [ ] 8.8 Test SSL connection toggle
- [ ] 8.9 Verify MySQL connections still work
- [ ] 8.10 Verify SQLite connections still work
