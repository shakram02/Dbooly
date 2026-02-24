## Context

The extension displays query results and table data in a webview-based HTML table. Currently this table is read-only. Users want to edit cell values directly in the table and have the changes persisted to the database, including row-level operations (add, delete, clone). The change spans the webview UI layer, the extension host messaging layer, and all three database provider backends.

## Goals / Non-Goals

- **Goals:**
  - Enable inline cell editing in both table browse mode and query mode with hover edit icon
  - Detect single-table queries in query mode to enable consistent editing UX
  - Allow editing of all columns including primary key columns
  - Generate safe, parameterized UPDATE/INSERT/DELETE queries using primary key for row identification
  - Support all three database backends (MySQL, PostgreSQL, SQLite)
  - Provide explicit NULL toggle to disambiguate NULL from empty string
  - Render type-aware editors based on column data type
  - Support row-level operations: add row, delete row, clone row
  - Provide a read-only mode toggle to suppress all mutation controls
  - Provide clear visual feedback on edit success/failure

- **Non-Goals:**
  - Editing results from multi-table queries (JOINs, UNIONs, subqueries, CTEs)
  - Batch editing / multi-cell selection editing
  - Transaction management (commit/rollback) — edits auto-commit immediately
  - Editing views (only base tables with primary keys)
  - Foreign key dropdown/lookup (future enhancement)

## Decisions

### 1. Editing in both table browse mode and query mode (single-table detection)

**Decision:** Enable editing in both modes when the result targets a single base table with a primary key.

- **Table browse mode:** The table name is always known (we constructed `SELECT * FROM table` ourselves). Editability is determined by checking the table has a PK and is not a view.
- **Query mode:** A heuristic single-table detector analyzes the executed SQL to determine if it targets exactly one table. If so, the table name is extracted and column metadata is fetched to determine editability.

**Single-table detection heuristic** (new utility: `src/sql/sql-table-detector.ts`):
1. Strip SQL comments (single-line `--` and multi-line `/* */`)
2. Normalize whitespace
3. Reject if query is not a SELECT (only SELECT results are editable)
4. Use the existing `extractTableReferences()` regex pattern (from `sql-diagnostics-provider.ts`) to find all `FROM` and `JOIN` table references
5. Check for disqualifying keywords: `JOIN`, `UNION`, `INTERSECT`, `EXCEPT`, `WITH` (CTEs)
6. Check for subqueries: nested `SELECT` after position 0
7. Check for comma-joins: multiple tables in FROM clause (e.g., `FROM a, b`)
8. If exactly one table is found and no disqualifiers → return table name
9. Otherwise → return null (non-editable, safe fallback)

**Why consistent UX:** Users shouldn't have to think about whether they browsed to data via the sidebar or typed `SELECT * FROM users WHERE active = true` in the editor. If the data comes from one table, it should be editable either way.

**Why heuristic over full parser:** The existing `extractTableReferences()` regex already handles the common patterns. Adding a full SQL parser library (e.g., `node-sql-parser`) would add bundle size and a dependency for marginal benefit. The heuristic conservatively falls back to non-editable for anything it can't confidently parse — a false negative (non-editable when it could be) is safe, a false positive (editable when it shouldn't be) is dangerous.

**Alternatives considered:**
- Table mode only: Simpler but inconsistent UX — users would be confused why the same data is editable from sidebar but not from a query
- Full SQL parser library: Accurate but adds dependency; the heuristic covers 95%+ of real-world single-table queries
- Use LSP for parsing: The `sql-language-server` is used for completions only, not structural analysis

### 2. Primary key or unique constraint for editability

**Decision:** Editing is enabled when the table has a primary key OR a UNIQUE NOT NULL constraint, and all identifying columns are present in the result set. Precedence: PK > first UNIQUE NOT NULL constraint > non-editable.

**Why:** Some tables lack a PK but have unique constraints (junction tables with unique composite indexes, or tables with a `uuid` column marked UNIQUE instead of PRIMARY KEY). A UNIQUE NOT NULL constraint is functionally equivalent to a PK for row identification — it guarantees exactly one row matches the WHERE clause. The NOT NULL requirement is critical because UNIQUE allows multiple NULLs.

**Implementation:** Extend `KeyType` in `ColumnInfo` to include `'UNIQUE'`. Update all three `listColumns()` providers to also query for unique constraints (`information_schema.TABLE_CONSTRAINTS` for MySQL/PostgreSQL, `PRAGMA index_list` for SQLite). The editability logic picks PK columns first; if none, falls back to the first UNIQUE NOT NULL constraint's columns.

**Alternatives considered:**
- PK only: Simpler but blocks editing on tables that are perfectly identifiable via unique constraints
- Use all columns in WHERE clause as fallback: Risk of updating wrong rows with duplicate data, and fails with NULL columns
- Use hidden ROWID (SQLite) / CTID (PostgreSQL): Not portable, not stable across vacuums, and MySQL has no equivalent for tables without PK

### 3. Primary key columns are editable

**Decision:** Allow editing of primary key columns. The UPDATE uses the **original** PK value in the WHERE clause to identify the row, and the SET clause updates the PK column to the new value.

**Why:** Users legitimately need to fix PK values. The row is refreshed after update, so the new PK value is reflected in the UI. If the update fails (e.g., duplicate PK constraint violation), the error is shown and the cell reverts.

**Risk:** If another row references this PK via a foreign key, the update may cascade or fail depending on FK constraints. This is expected database behavior and the error message will explain it.

### 4. Immediate auto-commit per edit

**Decision:** Each cell edit and row operation immediately executes and auto-commits.

**Why:** Simplest UX model. The project's transaction handling spec recommends "Smart Commit" with manual commit for modifications, but that infrastructure doesn't exist yet. Auto-commit is the starting point; transaction support can be layered on top later.

**Alternatives considered:**
- Batch pending edits with explicit commit: Requires transaction state management that doesn't exist yet; adds significant complexity

### 5. Edit icon trigger (not double-click)

**Decision:** Show a small edit (pencil) icon on cell hover; clicking it enters edit mode for that cell.

**Why:** Double-click conflicts with text selection (users may want to copy cell values). A dedicated edit icon provides clear affordance and avoids ambiguity. The icon is unobtrusive — it only appears on hover.

### 6. Explicit NULL toggle (not empty-input-means-NULL)

**Decision:** Each editable cell has a NULL toggle button that explicitly sets or unsets the NULL state. When NULL is active, the input is disabled and shows "NULL". Clearing the input to empty string submits `''`, not `NULL`.

**Why:** In SQL, empty string `''` and `NULL` are semantically different. Conflating them via "empty input = NULL" is a common source of data corruption bugs. An explicit toggle matches professional tools (DataGrip, DBeaver) and eliminates ambiguity. For non-nullable columns, the NULL toggle is hidden.

### 7. Type-aware editors

**Decision:** Map column data types to appropriate input widgets:

| Data Type Category | Editor Widget | Notes |
|---|---|---|
| Boolean (`bool`, `boolean`, `tinyint(1)`) | Checkbox | Toggle true/false directly |
| Date (`date`) | `<input type="date">` | Native date picker |
| DateTime (`datetime`, `timestamp`) | `<input type="datetime-local">` | Native datetime picker |
| Text/JSON (`text`, `longtext`, `json`, `jsonb`) | `<textarea>` in a small popup/overlay | Multi-line editing |
| Binary (`blob`, `bytea`, `binary`) | Disabled (not editable) | Show "[BINARY]" with no edit icon |
| All other types | `<input type="text">` | Default single-line text input |

**Why:** Type-specific editors reduce errors (e.g., date format mistakes), improve UX (checkboxes are faster than typing "true"/"false"), and prevent editing of types that can't be meaningfully edited inline (binary).

### 8. Row-level operations via gutter column

**Decision:** Add a narrow gutter column on the left side of the table with row-level action icons:
- **Delete row** (trash icon): Executes `DELETE FROM table WHERE pk = ?` with confirmation dialog
- **Clone row** (copy icon): Inserts a duplicate with auto-generated PK (or prompts for PK if not auto-increment)
- **Add row** button in the toolbar (not per-row): Inserts a new row with default/NULL values and opens all cells for editing

**Why:** Row operations are a natural extension of cell editing. The gutter column pattern is used by DataGrip and DBeaver. Delete uses the existing destructive operation safety pattern (confirmation dialog, consistent with `project.md` guidelines). Add is in the toolbar because it's not row-specific.

**Delete confirmation:** Uses a simple "Delete this row?" dialog with Cancel (default focus) and Delete buttons. Does not require type-name confirmation (that's reserved for DROP operations per `project.md`).

### 9. Read-only mode toggle

**Decision:** Add a lock/unlock icon toggle in the toolbar next to the search bar. When locked (read-only), all edit icons, NULL toggles, row action buttons, and the add row button are hidden. Default state is **read-only** (locked) — user must explicitly unlock to edit.

**Why:** Prevents accidental edits. Default-locked is the safer choice since auto-commit is irreversible. Users browsing data for reference shouldn't worry about accidentally modifying it.

### 10. Column metadata passed at data-load time

**Decision:** Fetch column metadata (via existing `listColumns()`) and pass it to the webview alongside the data. The webview uses this to determine: which columns are primary keys, which are nullable, what data type each column has, and whether editing is allowed.

- **Table browse mode:** Column metadata is fetched when the table data is loaded (the table name is known).
- **Query mode:** After query execution, the single-table detector extracts the table name. If a single table is detected, `listColumns()` is called to get column metadata. The result columns are matched against the table's columns to determine PK presence and editability.

**Why:** `listColumns()` already fetches all needed metadata (key type, data type, nullable). No new backend queries are needed beyond the one `listColumns()` call.

### 11. SchemaProvider methods for mutations

**Decision:** Add three methods to the `SchemaProvider` interface:
- `updateCell(pool, config, tableName, primaryKeys, columnName, newValue)` — UPDATE single cell
- `insertRow(pool, config, tableName, values)` — INSERT new row
- `deleteRow(pool, config, tableName, primaryKeys)` — DELETE single row

**Why:** Keeps all SQL generation and escaping in the provider layer. Each backend generates its own properly-escaped, parameterized queries.

## Data Flow

### Query Mode Editability Detection Flow
```
User executes SQL query → SqlExecutor runs query → gets QueryExecutionResult

SqlExecutor calls detectSingleTable(sql):
  Strips comments, normalizes whitespace
  Checks: is SELECT? no JOIN/UNION/WITH/subquery? one FROM table?
  Returns: tableName or null

If tableName found:
  Fetch columns via listColumns(tableName)
  Check: has PK or UNIQUE NOT NULL? all identifying columns in result set? is base table (not view)?
  If editable → pass tableName, columnMetadata, editable=true to TableDataPanel

TableDataPanel.showResult() sends data message with editability info to webview
```

### Cell Edit Flow
```
User hovers cell → edit icon appears (and NULL toggle if nullable)
User clicks edit icon → cell becomes type-appropriate input pre-filled with current value
User edits value and presses Enter (or clicks away) → webview sends message:
  { command: 'updateCell', column: 'name', value: 'new value', primaryKeys: { id: 42 } }

Extension host receives message →
  provider.updateCell(pool, config, tableName, { id: 42 }, 'name', 'new value')

Provider generates:
  MySQL:      UPDATE `table` SET `name` = ? WHERE `id` = ?  [params: 'new value', 42]
  PostgreSQL: UPDATE "table" SET "name" = $1 WHERE "id" = $2  [params: 'new value', 42]
  SQLite:     UPDATE "table" SET "name" = ? WHERE "id" = ?  [params: 'new value', 42]

Extension sends result back to webview:
  Success → { command: 'cellUpdateResult', success: true, column, rowIndex }
  Failure → { command: 'cellUpdateResult', success: false, error: '...' }

Webview updates cell display (green flash for success, red + error tooltip for failure)
```

### Delete Row Flow
```
User clicks trash icon in gutter → confirmation dialog appears
User confirms → webview sends:
  { command: 'deleteRow', primaryKeys: { id: 42 } }

Extension generates DELETE FROM table WHERE id = ?
  Success → row is removed from the table display
  Failure → error shown, row remains
```

### Add Row Flow
```
User clicks "Add Row" button in toolbar → webview sends:
  { command: 'insertRow', values: {} }

Extension generates INSERT with defaults → returns new row data
  Webview appends new row to table, opens all cells in edit mode
```

### Clone Row Flow
```
User clicks clone icon in gutter → webview sends:
  { command: 'cloneRow', values: { name: 'Alice', email: 'alice@example.com' }, primaryKeys: { id: 42 } }

Extension generates INSERT with all non-PK values from original row
  If PK is auto-increment → omit PK from INSERT
  If PK is not auto-increment → prompt user for new PK value
  Success → new row appears in table
  Failure → error shown
```

## Webview Message Protocol (New Messages)

### Extension → Webview (additions to `data` message)
```typescript
{
  command: 'data',
  // ... existing fields ...
  editable: boolean,              // true if single table with PK or UNIQUE NOT NULL, base table, either mode
  identifyingColumns: string[],   // PK columns, or UNIQUE NOT NULL columns as fallback. e.g. ['id'] or ['tenant_id', 'user_id']
  columnMetadata: Array<{         // per-column metadata for editors
    name: string,
    dataType: string,
    nullable: boolean,
    keyType: 'PRIMARY' | 'UNIQUE' | 'FOREIGN' | null,
  }>,
}
```

### Webview → Extension (new messages)
```typescript
// Cell update
{ command: 'updateCell', column: string, value: unknown, primaryKeys: Record<string, unknown>, rowIndex: number }

// Row delete
{ command: 'deleteRow', primaryKeys: Record<string, unknown>, rowIndex: number }

// Row insert (add new)
{ command: 'insertRow', values: Record<string, unknown> }

// Row clone
{ command: 'cloneRow', values: Record<string, unknown>, primaryKeys: Record<string, unknown> }
```

### Extension → Webview (new messages)
```typescript
// Cell update result
{ command: 'cellUpdateResult', success: boolean, column: string, rowIndex: number, updatedRow?: unknown[], error?: string }

// Row delete result
{ command: 'deleteRowResult', success: boolean, rowIndex: number, error?: string }

// Row insert result
{ command: 'insertRowResult', success: boolean, newRow?: unknown[], error?: string }
```

## Risks / Trade-offs

- **Risk:** Auto-commit means edits cannot be rolled back.
  - **Mitigation:** Default read-only mode prevents accidental edits. Delete has confirmation dialog. Future work can add undo via transaction support.

- **Risk:** Concurrent edits by other users can cause stale data.
  - **Mitigation:** After a successful update, refresh the row from the database to show the actual persisted value (catches triggers, defaults, etc.).

- **Risk:** Primary key editing can break foreign key references.
  - **Mitigation:** Database will enforce FK constraints and return an error if the update violates them. Error message is shown to user.

- **Risk:** Clone row with non-auto-increment PK requires user input for new PK.
  - **Mitigation:** Detect auto-increment from column metadata. If not auto-increment, prompt for PK value before inserting.

- **Risk:** Type-aware editors add UI complexity.
  - **Mitigation:** Implemented incrementally — text input as default, then add specialized editors one type at a time.

- **Risk:** Heuristic single-table detector could produce false positives (marks a multi-table query as editable).
  - **Mitigation:** The heuristic is conservative — it checks for JOINs, UNIONs, CTEs, subqueries, and comma-joins. Any ambiguity falls back to non-editable. Even in a false positive scenario, the UPDATE would target the detected table which would either succeed (if the column exists) or fail with a clear database error.

## Open Questions

None — all design decisions are resolved.
