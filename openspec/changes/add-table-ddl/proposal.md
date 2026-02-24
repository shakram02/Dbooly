# Change: Add Table DDL Show/Copy via Context Menu

## Why
Developers frequently need to inspect or share the DDL (CREATE TABLE statement) for a table while working with databases. Currently, dbooly has no way to retrieve or display DDL from the sidebar — users must manually write `SHOW CREATE TABLE` or equivalent queries. Adding "Show DDL" and "Copy DDL" context menu actions on table items makes schema inspection a one-click operation.

## What Changes
- Add a `getTableDDL()` method to the `SchemaProvider` interface, implemented for MySQL, PostgreSQL, and SQLite
- Register two new commands: `dbooly.showTableDDL` (opens DDL in a new SQL editor tab) and `dbooly.copyTableDDL` (copies DDL to clipboard)
- Add context menu entries on table items (`contextValue = "table"` and `"table-starred"`) in the sidebar tree view

## Implementation Approach

### MySQL
Single query: `SHOW CREATE TABLE \`tableName\`` — returns the complete DDL as a string. Trivial.

### SQLite
Single query: `SELECT sql FROM sqlite_master WHERE type='table' AND name=?` — SQLite stores the original CREATE statement verbatim. Trivial.

### PostgreSQL
PostgreSQL has no `SHOW CREATE TABLE` equivalent. All major tools (pg_dump, pgAdmin, DBeaver, DataGrip) solve this the same way: querying `pg_catalog` system tables and reconstructing the DDL in application code.

Our implementation queries `pg_catalog` (not `information_schema`, which lacks CHECK constraints and PostgreSQL-specific type details) and uses built-in helper functions to avoid manual parsing of raw catalog columns:

1. **Columns**: Query `pg_attribute` joined with `pg_type` and `pg_attrdef` for names, types, defaults, nullability
2. **Constraints**: Query `pg_constraint` using `pg_get_constraintdef(oid)` to get ready-to-use constraint SQL fragments (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)

This covers columns, data types, defaults, NOT NULL, PRIMARY KEY, FOREIGN KEY, UNIQUE, and CHECK constraints — sufficient for the developer use case of inspecting/sharing a table's shape. Indexes, triggers, storage parameters, partitions, and RLS policies are excluded from the initial implementation to keep scope minimal.

See `design.md` for the specific queries.

## Impact
- Affected specs: New capability `table-ddl`
- Affected code:
  - `src/providers/schema-provider.ts` — new interface method
  - `src/providers/mysql-schema-provider.ts` — `SHOW CREATE TABLE` implementation
  - `src/providers/postgresql-schema-provider.ts` — DDL reconstruction from `pg_catalog` using `pg_attribute`, `pg_constraint`, `pg_get_constraintdef()`
  - `src/providers/sqlite-schema-provider.ts` — `sqlite_master` SQL lookup
  - `src/connections/connection-tree-provider.ts` — command registration
  - `src/extension.ts` — command registration
  - `package.json` — commands and context menu contributions
