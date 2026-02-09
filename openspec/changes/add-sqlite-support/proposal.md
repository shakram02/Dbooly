# Change: Add SQLite Database Support

## Why
The extension currently only supports MySQL, but SQLite is one of the most widely-used databases for local development, prototyping, and embedded applications. Adding SQLite support expands the tool's usefulness for developers working with file-based databases.

## What Changes
- Add `'sqlite'` to the `DatabaseType` union type
- Create `SQLiteSchemaProvider` implementing the existing `SchemaProvider` interface
- Update `ConnectionPool` to handle SQLite connections via `better-sqlite3`
- Modify connection form to show file picker for SQLite (instead of host/port/credentials)
- Update connection tester to verify SQLite file accessibility
- Add `better-sqlite3` as a dependency

## Impact
- Affected specs: `connection-management`
- Affected code:
  - `src/models/connection.ts` - Type definitions
  - `src/providers/sqlite-schema-provider.ts` - NEW file
  - `src/providers/schema-provider.ts` - Register new provider
  - `src/connections/connection-pool.ts` - SQLite connection handling
  - `src/connections/connection-form.ts` - Conditional UI for SQLite
  - `src/connections/connection-tester.ts` - SQLite test function
  - `src/connections/connection-tree-provider.ts` - Display updates
  - `package.json` - Add better-sqlite3 dependency
