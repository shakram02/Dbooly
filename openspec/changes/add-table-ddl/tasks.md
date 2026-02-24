## 1. Schema Provider Interface
- [x] 1.1 Add `getTableDDL(pool, config, tableName): Promise<string>` to the `SchemaProvider` interface in `src/providers/schema-provider.ts`

## 2. MySQL Implementation
- [x] 2.1 Implement `getTableDDL` in `MySQLSchemaProvider` using `SHOW CREATE TABLE`
- [x] 2.2 Extract the DDL string from the result row's `Create Table` column

## 3. PostgreSQL Implementation
- [x] 3.1 Query `pg_attribute` + `pg_attrdef` for column definitions (name, type via `format_type()`, nullability, defaults via `pg_get_expr()`)
- [x] 3.2 Query `pg_constraint` for table-level constraints using `pg_get_constraintdef(oid, true)` — covers PK, FK, UNIQUE, CHECK
- [x] 3.3 Assemble the DDL string: `CREATE TABLE "name" ( columns..., constraints... );`
- [x] 3.4 Use existing `escapeIdentifier()` for table/column names in the output

## 4. SQLite Implementation
- [x] 4.1 Implement `getTableDDL` in `SQLiteSchemaProvider` using `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
- [x] 4.2 Append trailing semicolon if not present in the stored SQL

## 5. Command Registration & Context Menu
- [x] 5.1 Add `dbooly.showTableDDL` and `dbooly.copyTableDDL` command contributions to `package.json`
- [x] 5.2 Add context menu entries in `package.json` under `view/item/context` for both commands, targeting `viewItem =~ /^table/` in group `3_ddl`
- [x] 5.3 Register command handlers in `connection-tree-provider.ts` or `extension.ts`:
  - `showTableDDL`: Get active connection → fetch DDL → open in untitled SQL editor (`vscode.workspace.openTextDocument` + `vscode.window.showTextDocument`)
  - `copyTableDDL`: Get active connection → fetch DDL → `vscode.env.clipboard.writeText` → show info message

## 6. Validation
- [ ] 6.1 Manual test: right-click table in MySQL connection → Show DDL → verify editor opens with valid DDL
- [ ] 6.2 Manual test: right-click table in PostgreSQL connection → Show DDL → verify columns, types, defaults, NOT NULL, and constraints are present
- [ ] 6.3 Manual test: right-click table in PostgreSQL connection → Copy DDL → paste and verify the statement is re-executable
- [ ] 6.4 Manual test: right-click table in SQLite connection → Show DDL → verify editor opens with valid DDL
- [ ] 6.5 Manual test: verify context menu items appear for both starred and unstarred tables
- [ ] 6.6 Manual test: verify error message when no active connection
