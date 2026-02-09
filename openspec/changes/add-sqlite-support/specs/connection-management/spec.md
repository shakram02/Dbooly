## MODIFIED Requirements

### Requirement: Connection Configuration
The system SHALL allow users to configure database connections with the following properties:
- Connection name (user-defined identifier)
- Database type (MySQL or SQLite)
- For MySQL connections:
  - Host address
  - Port number
  - Database name
  - Username
  - Password (stored securely)
- For SQLite connections:
  - File path to the database file

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

## ADDED Requirements

### Requirement: SQLite Schema Queries
The system SHALL query SQLite database schemas using SQLite-specific syntax and PRAGMA commands.

#### Scenario: List tables in SQLite database
- **WHEN** user expands a SQLite connection in the tree view
- **THEN** the system queries `sqlite_master` for tables and views
- **AND** displays them in the tree with appropriate icons

#### Scenario: List columns for SQLite table
- **WHEN** user expands a table node under a SQLite connection
- **THEN** the system queries `PRAGMA table_info` for column metadata
- **AND** displays columns with their types, nullability, and key information

#### Scenario: Identify SQLite primary keys
- **WHEN** querying column information for a SQLite table
- **THEN** the system identifies primary key columns from `PRAGMA table_info` pk field
- **AND** displays the primary key indicator on those columns

#### Scenario: Identify SQLite foreign keys
- **WHEN** querying column information for a SQLite table
- **THEN** the system queries `PRAGMA foreign_key_list` for foreign key relationships
- **AND** displays foreign key references on applicable columns

### Requirement: SQLite Query Execution
The system SHALL execute SQL queries against SQLite databases using the better-sqlite3 driver.

#### Scenario: Execute SELECT query on SQLite
- **WHEN** user executes a SELECT query against a SQLite connection
- **THEN** the system returns the result set with columns and rows
- **AND** respects the configured row limit

#### Scenario: Execute data modification query on SQLite
- **WHEN** user executes INSERT, UPDATE, or DELETE query against a SQLite connection
- **THEN** the system executes the query and returns the affected row count

#### Scenario: Handle SQLite PRAGMA statements
- **WHEN** user executes a PRAGMA statement against a SQLite connection
- **THEN** the system treats it as a SELECT query and returns the result set

### Requirement: SQLite Connection Display
The system SHALL display SQLite connections distinctly in the tree view, showing relevant connection information.

#### Scenario: SQLite connection tooltip
- **WHEN** user hovers over a SQLite connection in the tree view
- **THEN** the tooltip displays the database file path

#### Scenario: SQLite connection description
- **WHEN** a SQLite connection is displayed in quick pick menus
- **THEN** the description shows "sqlite - /path/to/file.db"
