## ADDED Requirements

### Requirement: Table DDL Retrieval
The system SHALL provide a `getTableDDL` method on the `SchemaProvider` interface that returns the full `CREATE TABLE` statement for a given table.

Each database provider SHALL implement DDL retrieval using the database's native mechanism:
- **MySQL**: `SHOW CREATE TABLE` — returns the complete DDL directly
- **PostgreSQL**: Reconstruct DDL from `pg_catalog` system tables (`pg_attribute`, `pg_attrdef`, `pg_constraint`) using helper functions `format_type()`, `pg_get_expr()`, and `pg_get_constraintdef()`. The generated DDL SHALL include columns (name, type, nullability, defaults) and table-level constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK).
- **SQLite**: Read the `sql` column from `sqlite_master`

The returned DDL string SHALL be formatted as a valid, re-executable `CREATE TABLE` statement.

#### Scenario: Retrieve DDL for a MySQL table
- **WHEN** the user requests DDL for a table on a MySQL connection
- **THEN** the system executes `SHOW CREATE TABLE` and returns the DDL string

#### Scenario: Retrieve DDL for a PostgreSQL table
- **WHEN** the user requests DDL for a table on a PostgreSQL connection
- **THEN** the system queries `pg_attribute` for columns and `pg_constraint` for constraints, and assembles a `CREATE TABLE` statement from the results

#### Scenario: Retrieve DDL for a SQLite table
- **WHEN** the user requests DDL for a table on a SQLite connection
- **THEN** the system reads the creation SQL from `sqlite_master` and returns it

#### Scenario: Table does not exist
- **WHEN** DDL is requested for a table that does not exist
- **THEN** the system SHALL throw an error with a descriptive message

### Requirement: Show DDL Command
The system SHALL provide a "Show DDL" command (`dbooly.showTableDDL`) accessible from the table context menu in the sidebar tree view.

When invoked, the command SHALL:
1. Retrieve the DDL for the selected table using the active connection's schema provider
2. Open the DDL in a new untitled editor tab with SQL language mode set

The command SHALL be visible on both `table` and `table-starred` context values.

#### Scenario: Show DDL opens editor with DDL content
- **WHEN** the user right-clicks a table and selects "Show DDL"
- **THEN** a new untitled SQL editor tab opens containing the full CREATE TABLE statement

#### Scenario: Show DDL with no active connection
- **WHEN** the user invokes "Show DDL" but no connection is active
- **THEN** the system SHALL show an error message indicating no active connection

### Requirement: Copy DDL Command
The system SHALL provide a "Copy DDL" command (`dbooly.copyTableDDL`) accessible from the table context menu in the sidebar tree view.

When invoked, the command SHALL:
1. Retrieve the DDL for the selected table using the active connection's schema provider
2. Copy the DDL string to the system clipboard
3. Show a brief information message confirming the copy (e.g., "DDL copied to clipboard")

The command SHALL be visible on both `table` and `table-starred` context values.

#### Scenario: Copy DDL copies to clipboard
- **WHEN** the user right-clicks a table and selects "Copy DDL"
- **THEN** the CREATE TABLE statement is copied to the system clipboard and a confirmation message is shown

#### Scenario: Copy DDL with no active connection
- **WHEN** the user invokes "Copy DDL" but no connection is active
- **THEN** the system SHALL show an error message indicating no active connection

### Requirement: Context Menu Placement
The "Show DDL" and "Copy DDL" commands SHALL appear in the table context menu under a dedicated group (e.g., `3_ddl`) so they are visually separated from existing actions (View Data, Star/Unstar).

Both commands SHALL be visible when `viewItem` matches `table` or `table-starred`.

#### Scenario: DDL menu items visible on table context menu
- **WHEN** the user right-clicks a table item in the sidebar
- **THEN** "Show DDL" and "Copy DDL" appear in the context menu below the star/unstar actions
