## 1. Core Type Updates
- [x] 1.1 Add 'sqlite' to DatabaseType union in `src/models/connection.ts`
- [x] 1.2 Create discriminated union types (MySQLConnectionConfig, SQLiteConnectionConfig)
- [x] 1.3 Add type guard functions (isMySQLConnection, isSQLiteConnection)

## 2. SQLite Schema Provider
- [x] 2.1 Create `src/providers/sqlite-schema-provider.ts`
- [x] 2.2 Implement `listTables` using `sqlite_master` query
- [x] 2.3 Implement `listColumns` using `PRAGMA table_info`
- [x] 2.4 Implement `queryTableData` with proper identifier escaping
- [x] 2.5 Implement `executeQuery` with query type detection
- [x] 2.6 Register provider in `src/providers/schema-provider.ts`

## 3. Connection Pool Updates
- [x] 3.1 Add `better-sqlite3` import to `src/connections/connection-pool.ts`
- [x] 3.2 Update `PooledConnection` type to support SQLite databases
- [x] 3.3 Handle SQLite connection creation in `createConnection`
- [x] 3.4 Handle SQLite connection closing in `closeConnection`
- [x] 3.5 Update health check to work with SQLite (no ping method)

## 4. Connection Form UI
- [x] 4.1 Enable database type dropdown in form
- [x] 4.2 Add SQLite option to type selector
- [x] 4.3 Add file path input field with Browse button
- [x] 4.4 Implement `browseFile` command handler using `showOpenDialog`
- [x] 4.5 Show/hide fields based on selected database type
- [x] 4.6 Update form data collection for SQLite connections

## 5. Connection Testing
- [x] 5.1 Add SQLite test function in `src/connections/connection-tester.ts`
- [x] 5.2 Verify file exists and is readable
- [x] 5.3 Test database can be opened with simple query

## 6. Display Updates
- [x] 6.1 Update connection tree tooltip for SQLite (show file path)
- [x] 6.2 Update quick pick descriptions in connection commands
- [x] 6.3 Update status bar display in SQL executor

## 7. Dependencies
- [x] 7.1 Add `better-sqlite3` to dependencies in `package.json`
- [x] 7.2 Add `@types/better-sqlite3` to devDependencies

## 8. Verification
- [x] 8.1 Build extension without errors
- [ ] 8.2 Test adding SQLite connection via form
- [ ] 8.3 Test connection testing for SQLite
- [ ] 8.4 Test browsing tables in SQLite database
- [ ] 8.5 Test viewing table columns
- [ ] 8.6 Test querying table data
- [ ] 8.7 Test executing custom SQL queries
- [ ] 8.8 Verify MySQL connections still work
