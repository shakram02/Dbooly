## ADDED Requirements

### Requirement: Editability Detection
The system SHALL determine whether result set data is editable based on the following conditions:
- The data comes from a **single base table** (not a view)
- The table has at least one primary key column OR a UNIQUE NOT NULL constraint
- All identifying columns (PK or unique constraint columns) are present in the result set
- Read-only mode is not active

The system SHALL use the following precedence for row identification: primary key columns first, then the first UNIQUE NOT NULL constraint as fallback.

In **table browse mode**, the source table is always known. In **query mode**, the system SHALL use a heuristic single-table detector to analyze the executed SQL and determine if it targets exactly one table. Editing is enabled consistently in both modes when the conditions are met.

When editing is not available, cells SHALL NOT show edit controls. The system SHALL display a non-editable indicator in the toolbar explaining why editing is disabled (e.g., "Editing unavailable: no primary key or unique constraint", "Read-only mode", or "Editing unavailable: multi-table query").

#### Scenario: Table with primary key is editable in browse mode
- **WHEN** the user opens a base table in browse mode that has a primary key and read-only mode is off
- **THEN** cells display an edit icon on hover
- **AND** the user can click the icon to enter edit mode
- **AND** the primary key columns are used for row identification in WHERE clauses

#### Scenario: Table with UNIQUE NOT NULL constraint is editable
- **WHEN** the user opens a base table that has no primary key but has a UNIQUE NOT NULL constraint
- **AND** read-only mode is off
- **THEN** cells display an edit icon on hover
- **AND** the UNIQUE NOT NULL constraint columns are used for row identification in WHERE clauses

#### Scenario: Single-table query results are editable in query mode
- **WHEN** the user executes a single-table SELECT query (e.g., `SELECT * FROM users WHERE active = true`)
- **AND** the detected table has a primary key or UNIQUE NOT NULL constraint and all identifying columns are in the result set
- **AND** read-only mode is off
- **THEN** cells display an edit icon on hover
- **AND** the user can click the icon to enter edit mode

#### Scenario: Multi-table query results are not editable
- **WHEN** the user executes a query involving JOINs, UNIONs, subqueries, CTEs, or comma-joins
- **THEN** no edit icons are shown on cells
- **AND** a status message indicates "Editing unavailable: multi-table query"

#### Scenario: Table without primary key or unique constraint is not editable
- **WHEN** the user opens a table (in either mode) that has no primary key and no UNIQUE NOT NULL constraint
- **THEN** no edit icons are shown on cells
- **AND** a status message indicates "Editing unavailable: no primary key or unique constraint"

#### Scenario: View data is not editable
- **WHEN** the user opens a view in browse mode
- **THEN** no edit icons are shown on cells
- **AND** a status message indicates "Editing unavailable: views are not editable"

#### Scenario: Ambiguous queries fall back to non-editable
- **WHEN** the single-table detector cannot confidently determine the source table
- **THEN** the result is treated as non-editable (safe fallback)

---

### Requirement: Single-Table Detection
The system SHALL provide a heuristic analyzer that determines whether a SQL query targets exactly one base table, returning the table name if detected or null otherwise.

#### Scenario: Simple SELECT from single table
- **WHEN** the query is `SELECT * FROM users WHERE id > 10`
- **THEN** the detector returns table name `users`

#### Scenario: SELECT with alias
- **WHEN** the query is `SELECT u.name FROM users u WHERE u.active = true`
- **THEN** the detector returns table name `users`

#### Scenario: JOIN query rejected
- **WHEN** the query is `SELECT * FROM users JOIN orders ON users.id = orders.user_id`
- **THEN** the detector returns null (not editable)

#### Scenario: UNION query rejected
- **WHEN** the query is `SELECT * FROM users UNION SELECT * FROM admins`
- **THEN** the detector returns null (not editable)

#### Scenario: Subquery rejected
- **WHEN** the query is `SELECT * FROM (SELECT * FROM users) sub`
- **THEN** the detector returns null (not editable)

#### Scenario: CTE rejected
- **WHEN** the query is `WITH active AS (SELECT * FROM users) SELECT * FROM active`
- **THEN** the detector returns null (not editable)

#### Scenario: Comma-join rejected
- **WHEN** the query is `SELECT * FROM users, orders WHERE users.id = orders.user_id`
- **THEN** the detector returns null (not editable)

#### Scenario: Non-SELECT queries rejected
- **WHEN** the query is an INSERT, UPDATE, DELETE, or DDL statement
- **THEN** the detector returns null (not editable)

---

### Requirement: Read-Only Mode Toggle
The system SHALL provide a toggle in the table toolbar that switches between read-only mode (locked) and edit mode (unlocked). The default state SHALL be read-only (locked).

#### Scenario: Default state is read-only
- **WHEN** the user opens a table in browse mode
- **THEN** the toolbar shows a lock icon indicating read-only mode
- **AND** no edit icons, NULL toggles, row action buttons, or add row button are visible

#### Scenario: Unlock for editing
- **WHEN** the user clicks the lock icon to unlock
- **THEN** the icon changes to an unlocked state
- **AND** edit icons appear on cell hover
- **AND** the gutter column with row actions becomes visible
- **AND** the "Add Row" button appears in the toolbar

#### Scenario: Re-lock to read-only
- **WHEN** the user clicks the unlock icon to re-lock
- **THEN** all edit controls are hidden
- **AND** any cell currently in edit mode is cancelled (reverts to original value)

---

### Requirement: Inline Cell Edit Interaction
The system SHALL allow users to edit a cell value by clicking an edit icon that appears on hover, which replaces the cell content with a type-appropriate input widget pre-filled with the current value.

#### Scenario: Enter edit mode via edit icon
- **WHEN** the user hovers over an editable cell
- **THEN** a small pencil/edit icon appears in the cell
- **WHEN** the user clicks the edit icon
- **THEN** the cell content is replaced with a type-appropriate input widget containing the current value
- **AND** the input is focused and its text is selected

#### Scenario: Commit edit with Enter key
- **WHEN** the user presses Enter while editing a cell (except in textarea editors where Enter adds a newline)
- **THEN** the new value is submitted for update
- **AND** the input is replaced with a loading indicator

#### Scenario: Commit edit on blur
- **WHEN** the user clicks outside the editing cell or presses Tab
- **THEN** the new value is submitted for update

#### Scenario: Cancel edit with Escape key
- **WHEN** the user presses Escape while editing a cell
- **THEN** the edit is cancelled
- **AND** the cell reverts to displaying its original value
- **AND** no UPDATE query is executed

#### Scenario: No-op when value unchanged
- **WHEN** the user commits an edit but the value has not changed from the original
- **THEN** the cell exits edit mode without executing an UPDATE query

#### Scenario: Primary key cells are editable
- **WHEN** the user edits a primary key column cell
- **THEN** the UPDATE query uses the original PK value in the WHERE clause
- **AND** the SET clause updates the PK column to the new value
- **AND** the row is refreshed after update to reflect the new PK

---

### Requirement: NULL Toggle
The system SHALL provide an explicit NULL toggle button for each editable cell on a nullable column, allowing users to set or unset the NULL value independently of the input content.

#### Scenario: Set cell to NULL via toggle
- **WHEN** the user clicks the NULL toggle button on a nullable column cell
- **THEN** the cell value is set to NULL via an UPDATE query
- **AND** the input is disabled and displays "NULL" in italic style

#### Scenario: Unset NULL via toggle
- **WHEN** the user clicks the NULL toggle on a cell that is currently NULL
- **THEN** the NULL state is removed
- **AND** the input is enabled with an empty value for the user to type a new value

#### Scenario: Empty string is not NULL
- **WHEN** the user clears the input field and commits (without using the NULL toggle)
- **THEN** the cell value is set to empty string `''`, not NULL

#### Scenario: Non-nullable columns have no NULL toggle
- **WHEN** a column is defined as NOT NULL
- **THEN** no NULL toggle button is shown for cells in that column

---

### Requirement: Type-Aware Editors
The system SHALL render type-appropriate input widgets based on the column's data type when a cell enters edit mode.

#### Scenario: Boolean columns use checkbox
- **WHEN** the user edits a cell in a boolean column (`bool`, `boolean`, `tinyint(1)`)
- **THEN** the editor renders as a checkbox
- **AND** toggling the checkbox immediately submits the update (true/false)

#### Scenario: Date columns use date picker
- **WHEN** the user edits a cell in a date column (`date`)
- **THEN** the editor renders as an `<input type="date">` with native date picker

#### Scenario: DateTime columns use datetime picker
- **WHEN** the user edits a cell in a datetime column (`datetime`, `timestamp`, `timestamptz`)
- **THEN** the editor renders as an `<input type="datetime-local">` with native datetime picker

#### Scenario: Text and JSON columns use textarea overlay
- **WHEN** the user edits a cell in a text or JSON column (`text`, `longtext`, `mediumtext`, `json`, `jsonb`)
- **THEN** the editor renders as a `<textarea>` in a small popup overlay positioned near the cell
- **AND** Enter key adds a newline (Ctrl+Enter or a Save button commits the edit)

#### Scenario: Binary columns are not editable
- **WHEN** the user hovers over a cell in a binary column (`blob`, `bytea`, `binary`, `varbinary`)
- **THEN** no edit icon is shown
- **AND** the cell displays "[BINARY]" as before

#### Scenario: Default text input for other types
- **WHEN** the user edits a cell whose column type does not match any specialized editor
- **THEN** the editor renders as a standard `<input type="text">`

---

### Requirement: Cell Update Execution
The system SHALL execute a parameterized UPDATE query for each cell edit, using the table's identifying columns (primary key or UNIQUE NOT NULL constraint) to target the row.

#### Scenario: Single primary key update
- **WHEN** the user edits a cell in a table with a single primary key column `id`
- **THEN** the system executes `UPDATE table SET column = ? WHERE id = ?` with parameterized values
- **AND** identifiers (table name, column names) are properly escaped using database-specific escaping

#### Scenario: Composite primary key update
- **WHEN** the user edits a cell in a table with composite primary key columns `(tenant_id, user_id)`
- **THEN** the system executes `UPDATE table SET column = ? WHERE tenant_id = ? AND user_id = ?` with parameterized values

#### Scenario: Primary key column update
- **WHEN** the user edits a primary key column value
- **THEN** the system executes `UPDATE table SET pk_column = ? WHERE pk_column = ?` using the original PK value in WHERE and the new value in SET

#### Scenario: SQL injection prevention
- **WHEN** the user enters a value containing SQL metacharacters (e.g., `'; DROP TABLE users; --`)
- **THEN** the value MUST be passed as a parameterized query parameter
- **AND** the UPDATE executes safely without SQL injection

#### Scenario: Identifier escaping
- **WHEN** the table or column name contains special characters or reserved words
- **THEN** identifiers MUST be properly escaped using database-specific escaping (backticks for MySQL, double-quotes for PostgreSQL/SQLite)

---

### Requirement: Row-Level Operations
The system SHALL provide row-level operations (add, delete, clone) accessible via a gutter column and toolbar controls.

#### Scenario: Delete row with confirmation
- **WHEN** the user clicks the delete (trash) icon in the gutter column for a row
- **THEN** a confirmation dialog appears with "Delete this row?" and Cancel (default focus) and Delete buttons
- **WHEN** the user confirms deletion
- **THEN** the system executes `DELETE FROM table WHERE pk = ?` with parameterized primary key values
- **AND** on success, the row is removed from the table display

#### Scenario: Cancel delete
- **WHEN** the user clicks Cancel or dismisses the delete confirmation dialog
- **THEN** no DELETE query is executed
- **AND** the row remains in the table

#### Scenario: Add new row
- **WHEN** the user clicks the "Add Row" button in the toolbar
- **THEN** the system executes an INSERT with default/NULL values for all columns
- **AND** the new row is appended to the table
- **AND** the new row's cells enter edit mode for the user to fill in values

#### Scenario: Clone row
- **WHEN** the user clicks the clone (copy) icon in the gutter column for a row
- **THEN** the system inserts a new row with all non-auto-increment column values copied from the source row
- **AND** if the primary key is auto-increment, it is omitted from the INSERT (database assigns new PK)
- **AND** if the primary key is not auto-increment, the user is prompted to enter a new PK value before insertion
- **AND** the new row appears in the table on success

#### Scenario: Delete row error handling
- **WHEN** a DELETE query fails (e.g., foreign key constraint violation)
- **THEN** the row remains in the table
- **AND** the error message is shown to the user

---

### Requirement: Edit Feedback
The system SHALL provide immediate visual feedback after a cell edit or row operation attempt, indicating success or failure.

#### Scenario: Successful edit feedback
- **WHEN** the UPDATE query executes successfully
- **THEN** the cell displays the updated value
- **AND** a brief green flash or highlight indicates success
- **AND** the cell returns to its normal display state

#### Scenario: Failed edit feedback
- **WHEN** the UPDATE query fails (e.g., constraint violation, connection error)
- **THEN** the cell reverts to its original value
- **AND** a red highlight and error tooltip show the failure reason
- **AND** the error is also shown via `vscode.window.showErrorMessage`

#### Scenario: Row refresh after update
- **WHEN** the UPDATE query executes successfully
- **THEN** the system re-fetches the updated row from the database
- **AND** displays the actual persisted values (which may differ due to triggers, defaults, or computed columns)

#### Scenario: Successful row delete feedback
- **WHEN** a DELETE query executes successfully
- **THEN** the row is removed from the table with a brief fade-out animation

#### Scenario: Successful row insert feedback
- **WHEN** an INSERT query executes successfully
- **THEN** the new row appears in the table with a brief green flash highlight

---

### Requirement: Mutation Provider Methods
The `SchemaProvider` interface SHALL include `updateCell`, `insertRow`, and `deleteRow` methods that generate and execute parameterized mutation queries, supporting all three database backends (MySQL, PostgreSQL, SQLite).

#### Scenario: MySQL mutations with backtick escaping
- **WHEN** a mutation method is called for a MySQL connection
- **THEN** the query uses backtick-escaped identifiers and `?` parameter placeholders
- **AND** all user-provided values are passed as query parameters

#### Scenario: PostgreSQL mutations with double-quote escaping
- **WHEN** a mutation method is called for a PostgreSQL connection
- **THEN** the query uses double-quote-escaped identifiers and `$N` parameter placeholders
- **AND** all user-provided values are passed as query parameters

#### Scenario: SQLite mutations with double-quote escaping
- **WHEN** a mutation method is called for a SQLite connection
- **THEN** the query uses double-quote-escaped identifiers and `?` parameter placeholders
- **AND** all user-provided values are passed as query parameters
- **AND** the SQLite database file is saved after the mutation
