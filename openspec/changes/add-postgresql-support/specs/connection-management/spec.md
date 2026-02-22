## MODIFIED Requirements

### Requirement: Connection Configuration
The system SHALL allow users to configure database connections with the following properties:
- Connection name (user-defined identifier)
- Database type (MySQL, SQLite, or PostgreSQL)
- For MySQL connections:
  - Host address
  - Port number
  - Database name
  - Username
  - Password (stored securely)
- For SQLite connections:
  - File path to the database file
- For PostgreSQL connections:
  - Host address
  - Port number (default: 5432)
  - Database name
  - Username
  - Password (stored securely)
  - SSL mode toggle (enabled/disabled)

#### Scenario: Create new MySQL connection
- **WHEN** user provides valid MySQL connection details (name, host, port, database, username, password)
- **THEN** the connection configuration is stored
- **AND** the password is saved to VSCode SecretStorage

#### Scenario: Connection name uniqueness
- **WHEN** user creates a connection with a name that already exists
- **THEN** the system displays an error message
- **AND** the connection is not created

#### Scenario: Create new SQLite connection
- **WHEN** user provides a connection name and selects a valid SQLite database file
- **THEN** the connection configuration is stored with the file path
- **AND** no password is stored (SQLite files are not password-protected by default)

#### Scenario: SQLite file validation
- **WHEN** user selects a file path for SQLite connection
- **THEN** the system validates that the file exists and is accessible

#### Scenario: Create new PostgreSQL connection
- **WHEN** user provides valid PostgreSQL connection details (name, host, port, database, username, password)
- **THEN** the connection configuration is stored
- **AND** the password is saved to VSCode SecretStorage

#### Scenario: PostgreSQL connection with SSL
- **WHEN** user enables SSL for a PostgreSQL connection
- **THEN** the connection is established using SSL/TLS
- **AND** the SSL configuration is persisted with the connection

### Requirement: Connection Form UI
The system SHALL display a webview-based form for creating and editing connections, with fields that adapt based on the selected database type.

#### Scenario: Add connection form
- **WHEN** user triggers the add connection command
- **THEN** a webview panel opens with a form containing all connection fields
- **AND** the form includes Save, Test Connection, and Cancel buttons

#### Scenario: Edit connection form
- **WHEN** user triggers the edit connection command
- **THEN** a webview panel opens with the form pre-populated with existing values
- **AND** the user can modify any field and save changes

#### Scenario: Test connection from form
- **WHEN** user clicks "Test Connection" in the form
- **THEN** the system tests the connection using the current form values
- **AND** displays success or error feedback within the form

#### Scenario: MySQL form fields
- **WHEN** user selects MySQL as the database type
- **THEN** the form displays Host, Port, Database, Username, and Password fields

#### Scenario: SQLite form fields
- **WHEN** user selects SQLite as the database type
- **THEN** the form displays a File Path field with a Browse button
- **AND** the Host, Port, Database, Username, and Password fields are hidden

#### Scenario: Browse for SQLite file
- **WHEN** user clicks the Browse button for SQLite file selection
- **THEN** a file picker dialog opens filtered for database files (.db, .sqlite, .sqlite3)
- **AND** the selected file path is populated in the form

#### Scenario: PostgreSQL form fields
- **WHEN** user selects PostgreSQL as the database type
- **THEN** the form displays Host, Port (default 5432), Database, Username, Password, and SSL toggle fields

## ADDED Requirements

### Requirement: PostgreSQL Schema Queries
The system SHALL query PostgreSQL database schemas using information_schema views, scoped to the public schema by default.

#### Scenario: List tables in PostgreSQL database
- **WHEN** user expands a PostgreSQL connection in the tree view
- **THEN** the system queries `information_schema.tables` for the public schema
- **AND** displays tables in the tree with appropriate icons

#### Scenario: List columns for PostgreSQL table
- **WHEN** user expands a table node under a PostgreSQL connection
- **THEN** the system queries `information_schema.columns` for column metadata
- **AND** displays columns with their types, nullability, default values, and key information

#### Scenario: Identify PostgreSQL primary keys
- **WHEN** querying column information for a PostgreSQL table
- **THEN** the system queries `information_schema.table_constraints` and `information_schema.key_column_usage` for primary key columns
- **AND** displays the primary key indicator on those columns

#### Scenario: Identify PostgreSQL foreign keys
- **WHEN** querying column information for a PostgreSQL table
- **THEN** the system queries `information_schema.referential_constraints` and `information_schema.key_column_usage` for foreign key relationships
- **AND** displays foreign key references on applicable columns

### Requirement: PostgreSQL Query Execution
The system SHALL execute SQL queries against PostgreSQL databases using the pg driver with parameterized queries.

#### Scenario: Execute SELECT query on PostgreSQL
- **WHEN** user executes a SELECT query against a PostgreSQL connection
- **THEN** the system returns the result set with columns and rows
- **AND** respects the configured row limit

#### Scenario: Execute data modification query on PostgreSQL
- **WHEN** user executes INSERT, UPDATE, or DELETE query against a PostgreSQL connection
- **THEN** the system executes the query and returns the affected row count

#### Scenario: Handle PostgreSQL-specific SQL
- **WHEN** user executes PostgreSQL-specific statements (e.g., RETURNING clauses, CTEs, window functions)
- **THEN** the system executes them without error and returns results appropriately

#### Scenario: Query cancellation on PostgreSQL
- **WHEN** user cancels a running PostgreSQL query via the Escape key
- **THEN** the system sends a cancel signal to the PostgreSQL backend
- **AND** the query is terminated and control returns to the user

### Requirement: PostgreSQL Connection Display
The system SHALL display PostgreSQL connections distinctly in the tree view, showing relevant connection information.

#### Scenario: PostgreSQL connection tooltip
- **WHEN** user hovers over a PostgreSQL connection in the tree view
- **THEN** the tooltip displays the host, port, and database name

#### Scenario: PostgreSQL connection description
- **WHEN** a PostgreSQL connection is displayed in quick pick menus
- **THEN** the description shows "postgresql - host:port/database"

### Requirement: PostgreSQL Identifier Escaping
The system SHALL use double-quote escaping for PostgreSQL identifiers to prevent SQL injection.

#### Scenario: Escape table and column names
- **WHEN** the system constructs SQL queries with user-provided table or column identifiers
- **THEN** identifiers are wrapped in double quotes with internal double quotes doubled
- **AND** no raw identifier values are interpolated into SQL strings
