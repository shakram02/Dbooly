## ADDED Requirements

### Requirement: SQL Language Server Integration

The extension SHALL provide SQL language features (completions, hover, diagnostics) via the `sql-language-server` npm package.

#### Scenario: Server starts on connection activation
- **WHEN** a database connection is set as active
- **THEN** the SQL language server starts with that connection's configuration
- **AND** completions become available for SQL files

#### Scenario: Server stops on connection deactivation
- **WHEN** no database connection is active
- **THEN** the SQL language server stops
- **AND** generic SQL completions remain available (keywords only)

#### Scenario: Server restarts on connection switch
- **WHEN** the active connection changes to a different database
- **THEN** the SQL language server restarts with the new connection's configuration
- **AND** completions reflect the new database's schema

### Requirement: Multi-Database Adapter Support

The SQL language server client SHALL support MySQL, PostgreSQL, and SQLite databases.

#### Scenario: MySQL connection configuration
- **WHEN** a MySQL connection is activated
- **THEN** the language server receives adapter="mysql" with host, port, user, password, database

#### Scenario: PostgreSQL connection configuration
- **WHEN** a PostgreSQL connection is activated
- **THEN** the language server receives adapter="postgres" with host, port, user, password, database

#### Scenario: SQLite connection configuration
- **WHEN** a SQLite connection is activated
- **THEN** the language server receives adapter="sqlite3" with filename path
- **AND** host/port/user/password are NOT included

### Requirement: Schema-Aware Completions

The SQL language server SHALL provide completions based on the connected database's schema.

#### Scenario: Table name completions
- **GIVEN** an active database connection with tables "users" and "orders"
- **WHEN** the user types "SELECT * FROM " in a SQL file
- **THEN** completions include "users" and "orders"

#### Scenario: Column name completions
- **GIVEN** an active database connection where "users" table has columns "id", "name", "email"
- **WHEN** the user types "SELECT " after "FROM users"
- **THEN** completions include "id", "name", "email"

### Requirement: Graceful Degradation

The extension SHALL handle SQL language server failures gracefully.

#### Scenario: Server fails to start
- **WHEN** the SQL language server fails to start (e.g., npm package missing)
- **THEN** an error is logged to the output channel
- **AND** the extension continues to function without LSP features
- **AND** no error notification is shown to the user

#### Scenario: Server crashes during operation
- **WHEN** the SQL language server crashes unexpectedly
- **THEN** the client attempts to restart the server
- **AND** an error is logged to the output channel

## REMOVED Requirements

### Requirement: sqls Binary Management

**Reason**: sqls is archived and no longer maintained. Platform-specific binary management is replaced by npm package.

**Migration**: No user action required. The npm package is bundled with the extension.
