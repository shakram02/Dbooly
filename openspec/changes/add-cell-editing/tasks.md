## 1. Single-Table Detection Utility

- [x] 1.1 Create `src/sql/sql-table-detector.ts` with `detectSingleTable(sql: string): string | null` function
- [x] 1.2 Implement: strip comments, normalize whitespace, reject non-SELECT
- [x] 1.3 Implement: extract table references using `FROM table` regex pattern (adapted from `extractTableReferences()` in diagnostics)
- [x] 1.4 Implement: reject if query contains JOIN, UNION, INTERSECT, EXCEPT, WITH keywords
- [x] 1.5 Implement: reject if query contains subqueries (nested SELECT after position 0)
- [x] 1.6 Implement: reject if FROM clause has multiple tables (comma-join detection)
- [x] 1.7 Return table name if exactly one table found and no disqualifiers, null otherwise

## 2. Column Model: UNIQUE Key Type Support

- [x] 2.1 Extend `KeyType` in `src/models/column.ts` to `'PRIMARY' | 'UNIQUE' | 'FOREIGN' | null`
- [x] 2.2 Update `MySQLSchemaProvider.listColumns()` to detect UNIQUE NOT NULL constraints (query `information_schema.TABLE_CONSTRAINTS` + `KEY_COLUMN_USAGE`)
- [x] 2.3 Update `PostgreSQLSchemaProvider.listColumns()` to detect UNIQUE NOT NULL constraints (query `information_schema.table_constraints`)
- [x] 2.4 Update `SQLiteSchemaProvider.listColumns()` to detect UNIQUE NOT NULL constraints (`PRAGMA index_list` + `PRAGMA index_info`)

## 3. Backend: SchemaProvider Interface & Mutation Types

- [x] 2.1 Add `UpdateCellResult` type (`{ success: boolean; error?: string; updatedRow?: unknown[] }`) to `schema-provider.ts`
- [x] 2.2 Add `InsertRowResult` type (`{ success: boolean; error?: string; newRow?: unknown[] }`) to `schema-provider.ts`
- [x] 2.3 Add `DeleteRowResult` type (`{ success: boolean; error?: string }`) to `schema-provider.ts`
- [x] 2.4 Add `updateCell(pool, config, tableName, primaryKeys, columnName, newValue)` method to `SchemaProvider` interface
- [x] 2.5 Add `insertRow(pool, config, tableName, values)` method to `SchemaProvider` interface
- [x] 2.6 Add `deleteRow(pool, config, tableName, primaryKeys)` method to `SchemaProvider` interface

## 4. Backend: MySQL Provider Implementation

- [x] 3.1 Implement `updateCell` in `MySQLSchemaProvider` with backtick escaping and `?` params
- [x] 3.2 Implement `insertRow` in `MySQLSchemaProvider` with backtick escaping and `?` params
- [x] 3.3 Implement `deleteRow` in `MySQLSchemaProvider` with backtick escaping and `?` params

## 5. Backend: PostgreSQL Provider Implementation

- [x] 4.1 Implement `updateCell` in `PostgreSQLSchemaProvider` with double-quote escaping and `$N` params
- [x] 4.2 Implement `insertRow` in `PostgreSQLSchemaProvider` with double-quote escaping and `$N` params
- [x] 4.3 Implement `deleteRow` in `PostgreSQLSchemaProvider` with double-quote escaping and `$N` params

## 6. Backend: SQLite Provider Implementation

- [x] 5.1 Implement `updateCell` in `SQLiteSchemaProvider` with double-quote escaping and `?` params, plus `saveSQLiteDatabase()` call
- [x] 5.2 Implement `insertRow` in `SQLiteSchemaProvider` with double-quote escaping and `?` params, plus `saveSQLiteDatabase()` call
- [x] 5.3 Implement `deleteRow` in `SQLiteSchemaProvider` with double-quote escaping and `?` params, plus `saveSQLiteDatabase()` call

## 7. Extension Host: Column Metadata & Editability

- [x] 6.1 Update `showTableData` signature to accept column metadata (`ColumnInfo[]`) and table type (`TableType`)
- [x] 6.2 Derive `editable`, `primaryKeyColumns`, and `columnMetadata` from `ColumnInfo[]` and `TableType`
- [x] 6.3 Add `editable`, `primaryKeyColumns`, and `columnMetadata` fields to the `data` message sent to webview
- [x] 6.4 Fetch column metadata in `viewTableData` command handler (call `listColumns()` alongside `queryTableData()`)
- [x] 6.5 In `SqlExecutor` / `showResult()` flow: after SELECT query execution, call `detectSingleTable(sql)` on the executed SQL
- [x] 6.6 If single table detected in query mode: fetch column metadata via `listColumns()`, check PK presence in result columns, pass editability info to `TableDataPanel.showResult()`
- [x] 6.7 Update `showResult()` to accept and forward optional editability metadata to the webview `data` message

## 8. Extension Host: Mutation Message Handlers

- [x] 7.1 Add `updateCell` message handler in `setupMessageHandler()` — calls provider `updateCell`, sends `cellUpdateResult` back
- [x] 7.2 Add `deleteRow` message handler — shows confirmation dialog, calls provider `deleteRow`, sends `deleteRowResult` back
- [x] 7.3 Add `insertRow` message handler — calls provider `insertRow`, sends `insertRowResult` back
- [x] 7.4 Add `cloneRow` message handler — determines auto-increment status, calls provider `insertRow` with source row values, sends `insertRowResult` back
- [x] 7.5 On successful update, re-fetch the updated row from the database and include it in the result message

## 9. Webview: Read-Only Mode Toggle

- [x] 8.1 Add lock/unlock icon toggle to toolbar with CSS styling
- [x] 8.2 Default state is read-only (locked)
- [x] 8.3 Toggle hides/shows all edit controls (edit icons, NULL toggles, gutter column, add row button)
- [x] 8.4 Toggling to locked while a cell is in edit mode cancels the edit

## 10. Webview: Inline Cell Edit UI

- [x] 9.1 Add CSS styles for edit icon (pencil), edit input, NULL toggle button, success/error flash animations, loading spinner
- [x] 9.2 Render edit icon on editable cell hover (all columns including PK, excluding binary columns)
- [x] 9.3 Implement click-to-edit: replace cell content with type-appropriate input pre-filled with current value
- [x] 9.4 Handle Enter (commit), Escape (cancel), Tab (commit and move to next cell), and blur (commit) events
- [x] 9.5 Send `updateCell` message to extension with column name, new value, primary key values, and row index
- [x] 9.6 Show loading state in cell during update execution
- [x] 9.7 Display success flash (green highlight) or error state (red highlight + tooltip) on result
- [x] 9.8 Update cell display with refreshed row data from server response
- [x] 9.9 Skip update when value is unchanged from original
- [x] 9.10 Show non-editable indicator in toolbar when editing is disabled (no PK, view, multi-table query)

## 11. Webview: NULL Toggle

- [x] 10.1 Add NULL toggle button (small "NULL" badge/icon) next to input on nullable columns
- [x] 10.2 Clicking toggle sets value to NULL (disables input, shows "NULL" in italic)
- [x] 10.3 Clicking toggle again unsets NULL (enables input with empty value)
- [x] 10.4 Hide NULL toggle on non-nullable columns
- [x] 10.5 When NULL is toggled on, immediately submit the NULL update

## 12. Webview: Type-Aware Editors

- [x] 11.1 Create editor type mapping function: `getEditorType(dataType: string) → 'checkbox' | 'date' | 'datetime' | 'textarea' | 'disabled' | 'text'`
- [x] 11.2 Implement checkbox editor for boolean columns (immediate submit on toggle)
- [x] 11.3 Implement `<input type="date">` editor for date columns
- [x] 11.4 Implement `<input type="datetime-local">` editor for datetime/timestamp columns
- [x] 11.5 Implement textarea overlay editor for text/JSON columns (Ctrl+Enter to commit, Escape to cancel)
- [x] 11.6 Disable editing for binary/blob columns (no edit icon shown)

## 13. Webview: Row-Level Operations

- [x] 12.1 Add gutter column (narrow, leftmost) with row action icons (delete, clone)
- [x] 12.2 Style gutter column to match table theme (icons appear on row hover)
- [x] 12.3 Implement delete icon click → send `deleteRow` message with primary keys
- [x] 12.4 Implement clone icon click → send `cloneRow` message with row values
- [x] 12.5 Add "Add Row" button in toolbar (visible only when unlocked and editable)
- [x] 12.6 Handle `deleteRowResult` message — remove row with fade-out animation on success, show error on failure
- [x] 12.7 Handle `insertRowResult` message — append row with green flash on success, open cells in edit mode for new rows
