# Tasks: Replace sqls with sql-language-server

## 1. Setup and Dependencies
- [x] 1.1 Add `sql-language-server` to package.json dependencies
- [x] 1.2 Run `npm install` to install the package
- [x] 1.3 Verify package installs correctly and check version

## 2. Create New LSP Client
- [x] 2.1 Create `src/lsp/` directory
- [x] 2.2 Create `src/lsp/sql-language-server-client.ts` with basic structure
- [x] 2.3 Implement `SqlLanguageServerClient` class with:
  - [x] 2.3.1 Constructor accepting extensionPath and connectionManager
  - [x] 2.3.2 `initialize()` method to subscribe to connection changes
  - [x] 2.3.3 `start()` method to spawn sql-language-server
  - [x] 2.3.4 `stop()` method to terminate server
  - [x] 2.3.5 `onConnectionChange()` handler
  - [x] 2.3.6 `buildConfig()` to map dbooly connection to sql-language-server format
  - [x] 2.3.7 `dispose()` for cleanup
- [x] 2.4 Add adapter mapping for database types:
  - [x] 2.4.1 `mysql` → `mysql`
  - [x] 2.4.2 `postgres` → `postgres`
  - [x] 2.4.3 `sqlite` → `sqlite3`
- [x] 2.5 Handle SQLite special case (filename instead of host/port)

## 3. Update Extension Integration
- [x] 3.1 Update import in `src/extension.ts` from `SqlsClient` to `SqlLanguageServerClient`
- [x] 3.2 Update instantiation to use new class
- [x] 3.3 Verify output channel name (rename from 'sqls' to 'SQL Language Server')

## 4. Testing
- [ ] 4.1 Test MySQL connection:
  - [ ] 4.1.1 Verify completions for table names
  - [ ] 4.1.2 Verify completions for column names
  - [ ] 4.1.3 Verify hover information
  - [ ] 4.1.4 Verify basic diagnostics
- [ ] 4.2 Test PostgreSQL connection:
  - [ ] 4.2.1 Verify completions for table names
  - [ ] 4.2.2 Verify completions for column names
  - [ ] 4.2.3 Verify hover information
- [ ] 4.3 Test SQLite connection:
  - [ ] 4.3.1 Verify file-based connection works
  - [ ] 4.3.2 Verify completions for table names
- [ ] 4.4 Test connection switching:
  - [ ] 4.4.1 Switch from MySQL to PostgreSQL
  - [ ] 4.4.2 Verify completions reflect new database schema
- [ ] 4.5 Test edge cases:
  - [ ] 4.5.1 Start extension with no active connection
  - [ ] 4.5.2 Activate connection and verify LSP starts
  - [ ] 4.5.3 Deactivate connection and verify LSP stops

## 5. Remove Old Implementation
- [x] 5.1 Delete `src/sqls/sqls-client.ts`
- [x] 5.2 Delete `src/sqls/` directory (if empty)
- [x] 5.3 Delete `scripts/download-sqls.js`
- [x] 5.4 Delete `bin/` directory and all contents
- [x] 5.5 Update `package.json`:
  - [x] 5.5.1 Remove `download-sqls` script
  - [x] 5.5.2 Remove `download-sqls:current` script
  - [x] 5.5.3 Update `vscode:prepublish` to remove `npm run download-sqls`
- [x] 5.6 Update `.gitignore` if it has sqls-related entries

## 6. Documentation
- [ ] 6.1 Update any README mentions of sqls (if any)
- [ ] 6.2 Update CHANGELOG with migration note

## 7. Final Verification
- [x] 7.1 Run `npm run build` - verify no errors
- [ ] 7.2 Run `npm run lint` - verify no lint errors (ESLint not configured)
- [ ] 7.3 Test extension in VSCode Extension Development Host
- [x] 7.4 Verify bundle size reduction

## 8. Schema Caching (Performance Optimization)
- [x] 8.1 Create `src/lsp/schema-cache.ts` with `SchemaCache` class
- [x] 8.2 Implement schema fetching using existing SchemaProvider
- [x] 8.3 Convert schema to sql-language-server JSON format
- [x] 8.4 Cache to `~/.config/dbooly/schema-cache/{connectionId}.json`
- [x] 8.5 Update `SqlLanguageServerClient` to use JSON adapter with cached schema
- [x] 8.6 Implement background refresh while serving cached data
- [x] 8.7 Add `refreshCurrentSchema()` method for manual refresh
- [x] 8.8 Update `extension.ts` to pass ConnectionPool to LSP client
