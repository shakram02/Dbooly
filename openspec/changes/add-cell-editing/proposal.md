# Change: Add inline data editing for result set tables

## Why
Users need to edit data directly in the result table without writing SQL manually. This is a core data management capability listed in the project's purpose ("Data management: View, add, edit, and delete rows") that is not yet implemented.

## What Changes
- Add an edit icon on each cell that enters an inline edit state
- On commit, generate and execute a parameterized `UPDATE` query targeting the edited cell using the row's primary key
- Primary key columns are editable (the UPDATE uses the original PK value in WHERE clause, then the refreshed row reflects the new PK)
- Editing is available in **both table browse mode and query mode** when the query targets a single table — consistent UX regardless of how the user reached the data
- **Single-table detection**: In table browse mode, the table is always known. In query mode, a heuristic analyzer (building on the existing `extractTableReferences()` regex in `sql-diagnostics-provider.ts`) determines if the query targets exactly one table with no JOINs, UNIONs, CTEs, or subqueries. Falls back to non-editable for anything ambiguous.
- Fetch primary key metadata at data-load time; fall back to UNIQUE NOT NULL constraints if no primary key exists. If neither PK nor unique constraint is available, editing is disabled with a tooltip explanation
- Extend `KeyType` in `ColumnInfo` model to include `'UNIQUE'` and update all three `listColumns()` providers to detect unique constraints
- **NULL toggle button**: Explicit toggle per cell to set/unset NULL, disambiguating between empty string and NULL
- **Type-aware editors**: Map column data types to appropriate input widgets — checkbox for boolean, date picker for date/datetime, textarea for text/JSON, disabled for binary/blob
- **Row-level operations**: Add row (INSERT), delete row (DELETE) with confirmation, and clone row actions via a gutter column
- **Read-only mode toggle**: Global toggle in the toolbar to suppress all edit/mutation controls as a safety net
- Add new `updateCell`, `insertRow`, and `deleteRow` methods to the `SchemaProvider` interface for all three database backends (MySQL, PostgreSQL, SQLite)
- Show inline success/error feedback after each mutation

## Impact
- Affected specs: New capability `result-data-editing` (no existing specs modified)
- Affected code:
  - `src/views/table-data-panel.ts` — webview UI for edit controls, row operations, type-aware editors, NULL toggle, read-only toggle, and messaging
  - `src/providers/schema-provider.ts` — new `updateCell`, `insertRow`, `deleteRow` methods on `SchemaProvider` interface
  - `src/providers/mysql-schema-provider.ts` — MySQL implementations
  - `src/providers/postgresql-schema-provider.ts` — PostgreSQL implementations
  - `src/providers/sqlite-schema-provider.ts` — SQLite implementations
  - `src/models/column.ts` — extend `KeyType` to include `'UNIQUE'`
  - `src/sql/sql-table-detector.ts` — new utility: heuristic single-table detection for query mode editability
  - `src/connections/connection-tree-provider.ts` — pass column metadata and mutation callbacks to `TableDataPanel`
  - `src/sql/sql-executor.ts` — pass detected table name to result panel for query mode editing
