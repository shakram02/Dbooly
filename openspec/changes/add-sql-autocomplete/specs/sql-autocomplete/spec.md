## ADDED Requirements

### Requirement: SQL Auto-Completion Provider
The system SHALL provide auto-completion suggestions for table and column names when editing SQL files (`.sql` extension) with an active database connection.

#### Scenario: No active connection
- **WHEN** user triggers auto-completion in a SQL file
- **AND** no database connection is active
- **THEN** no suggestions are shown
- **AND** no error is displayed

#### Scenario: Active connection with cached schema
- **WHEN** user triggers auto-completion in a SQL file
- **AND** a database connection is active with cached schema
- **THEN** relevant suggestions are shown based on cursor context

### Requirement: Context-Aware Table Suggestions
The system SHALL suggest table names when the cursor is in a position where a table reference is expected.

#### Scenario: After FROM keyword
- **WHEN** user types `SELECT * FROM ` and triggers completion
- **THEN** all tables from the active connection are suggested
- **AND** each suggestion shows the table type (TABLE or VIEW) as detail

#### Scenario: After JOIN keyword
- **WHEN** user types `SELECT * FROM users JOIN ` and triggers completion
- **THEN** all tables from the active connection are suggested

#### Scenario: After INNER/LEFT/RIGHT/CROSS JOIN
- **WHEN** user types `SELECT * FROM users LEFT JOIN ` and triggers completion
- **THEN** all tables from the active connection are suggested

### Requirement: Context-Aware Column Suggestions
The system SHALL suggest column names when the cursor is in a position where a column reference is expected.

#### Scenario: After SELECT keyword
- **WHEN** user types `SELECT ` and triggers completion
- **AND** tables are present in the FROM clause
- **THEN** columns from tables in the query are suggested
- **AND** each suggestion shows the column data type as detail

#### Scenario: After SELECT with no FROM clause yet
- **WHEN** user types `SELECT ` and triggers completion
- **AND** no FROM clause exists in the query
- **THEN** columns from all tables are suggested

#### Scenario: After WHERE keyword
- **WHEN** user types `SELECT * FROM users WHERE ` and triggers completion
- **THEN** columns from the `users` table are suggested

#### Scenario: After ORDER BY
- **WHEN** user types `SELECT * FROM users ORDER BY ` and triggers completion
- **THEN** columns from tables in the query are suggested

#### Scenario: After GROUP BY
- **WHEN** user types `SELECT * FROM users GROUP BY ` and triggers completion
- **THEN** columns from tables in the query are suggested

#### Scenario: After ON in JOIN clause
- **WHEN** user types `SELECT * FROM users JOIN orders ON ` and triggers completion
- **THEN** columns from both `users` and `orders` tables are suggested

#### Scenario: After HAVING keyword
- **WHEN** user types `SELECT * FROM users GROUP BY status HAVING ` and triggers completion
- **THEN** columns from tables in the query are suggested

#### Scenario: INSERT column list
- **WHEN** user types `INSERT INTO users (` and triggers completion
- **THEN** columns from the `users` table are suggested

#### Scenario: UPDATE SET clause
- **WHEN** user types `UPDATE users SET ` and triggers completion
- **THEN** columns from the `users` table are suggested

#### Scenario: Subquery context
- **WHEN** user types `SELECT * FROM (SELECT ` and triggers completion
- **THEN** columns from all tables are suggested (no specific table context yet)

### Requirement: Dot-Notation Column Completion
The system SHALL suggest columns for a specific table when the user types a table name or alias followed by a dot.

#### Scenario: Table name dot completion
- **WHEN** user types `users.` in a SQL query
- **THEN** only columns from the `users` table are suggested
- **AND** suggestions appear immediately (dot is a trigger character)

#### Scenario: Table alias dot completion
- **WHEN** user types `SELECT u.` in a query containing `FROM users u`
- **THEN** only columns from the `users` table are suggested

#### Scenario: Unknown table dot completion
- **WHEN** user types `unknown_table.` where `unknown_table` is not in the schema
- **THEN** no suggestions are shown

### Requirement: Schema Caching
The system SHALL cache table and column metadata to provide fast auto-completion without repeated database queries.

#### Scenario: Initial cache load
- **WHEN** auto-completion is first triggered for a connection
- **AND** schema is not cached
- **THEN** the system fetches tables and columns from the database
- **AND** caches the result for subsequent completions

#### Scenario: Cache hit
- **WHEN** auto-completion is triggered
- **AND** schema is already cached for the active connection
- **THEN** suggestions are provided from cache without database query

#### Scenario: Connection change clears cache
- **WHEN** the active connection changes to a different database
- **THEN** the schema cache for the previous connection is cleared
- **AND** the new connection's schema is loaded on next completion request

#### Scenario: Manual cache refresh
- **WHEN** user executes the `dbooly.refreshSchemaCache` command
- **THEN** the schema cache for the active connection is cleared
- **AND** fresh schema is fetched from the database

### Requirement: Comment and String Awareness
The system SHALL ignore SQL keywords that appear inside comments or string literals when determining cursor context.

#### Scenario: Keyword inside line comment
- **WHEN** user types `SELECT * -- FROM users\nFROM ` and triggers completion after the second FROM
- **THEN** tables are suggested (the commented FROM is ignored)

#### Scenario: Keyword inside block comment
- **WHEN** user types `SELECT * /* FROM orders */ FROM ` and triggers completion
- **THEN** tables are suggested (the commented FROM is ignored)

#### Scenario: Keyword inside string literal
- **WHEN** user types `SELECT 'FROM users' FROM ` and triggers completion
- **THEN** tables are suggested (the string content is ignored)

### Requirement: Loading State
The system SHALL indicate when schema is being loaded and handle the loading state gracefully.

#### Scenario: Schema loading in progress
- **WHEN** auto-completion is triggered
- **AND** schema is being fetched from the database
- **THEN** a loading indicator is shown in the completion list
- **OR** completion is deferred until schema is available

#### Scenario: Schema fetch failure
- **WHEN** schema fetch fails due to connection error
- **THEN** no suggestions are shown
- **AND** the error is logged (not shown to user during typing)

### Requirement: Completion Item Presentation
The system SHALL present completion items with appropriate icons and details to help users identify suggestions.

#### Scenario: Table completion item
- **WHEN** a table is suggested
- **THEN** the completion item uses `CompletionItemKind.Module` (or similar table icon)
- **AND** the detail shows the table type (TABLE or VIEW)

#### Scenario: Column completion item
- **WHEN** a column is suggested
- **THEN** the completion item uses `CompletionItemKind.Field`
- **AND** the detail shows the column data type (e.g., `varchar(255)`, `int`)
- **AND** primary key columns are indicated in the detail
