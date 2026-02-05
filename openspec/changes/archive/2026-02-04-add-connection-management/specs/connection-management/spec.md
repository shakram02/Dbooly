## ADDED Requirements

### Requirement: Connection Configuration
The system SHALL allow users to configure database connections with the following properties:
- Connection name (user-defined identifier)
- Database type (MySQL)
- Host address
- Port number
- Database name
- Username
- Password (stored securely)

#### Scenario: Create new MySQL connection
- **WHEN** user provides valid MySQL connection details (name, host, port, database, username, password)
- **THEN** the connection configuration is stored
- **AND** the password is saved to VSCode SecretStorage

#### Scenario: Connection name uniqueness
- **WHEN** user creates a connection with a name that already exists
- **THEN** the system displays an error message
- **AND** the connection is not created

### Requirement: Connection Persistence
The system SHALL persist connection configurations to a workspace-local JSON file (`.vscode/dbooly-connections.json`), excluding sensitive credentials.

#### Scenario: Save connection to file
- **WHEN** a connection is created or updated
- **THEN** the connection metadata (excluding password) is written to `.vscode/dbooly-connections.json`

#### Scenario: Load connections on startup
- **WHEN** the extension activates
- **THEN** previously saved connections are loaded from `.vscode/dbooly-connections.json`
- **AND** connections are available for use

#### Scenario: Workspace without connections file
- **WHEN** the extension activates and no connections file exists
- **THEN** no connections are loaded
- **AND** no error is displayed

### Requirement: Connection CRUD Operations
The system SHALL provide commands to create, read, update, and delete database connections.

#### Scenario: Create connection via command
- **WHEN** user executes `dbooly.addConnection` command
- **THEN** a form/input flow prompts for connection details
- **AND** the connection is saved upon completion

#### Scenario: Edit existing connection
- **WHEN** user executes `dbooly.editConnection` command with a connection identifier
- **THEN** the current connection details are displayed for editing
- **AND** changes are saved upon confirmation

#### Scenario: Delete connection
- **WHEN** user executes `dbooly.deleteConnection` command with a connection identifier
- **THEN** the user is prompted for confirmation
- **AND** upon confirmation, the connection is removed from storage
- **AND** associated credentials are removed from SecretStorage

#### Scenario: List all connections
- **WHEN** user executes `dbooly.listConnections` command
- **THEN** all saved connections are displayed with their names and database types

### Requirement: Connection Testing
The system SHALL allow users to test a connection before saving it.

#### Scenario: Test successful connection
- **WHEN** user tests a connection with valid credentials
- **THEN** the system attempts to connect to the database
- **AND** displays a success message if connection succeeds

#### Scenario: Test failed connection
- **WHEN** user tests a connection with invalid credentials or unreachable host
- **THEN** the system displays an error message describing the failure
- **AND** the connection is not automatically saved

### Requirement: Secure Credential Storage
The system SHALL store database passwords using VSCode's SecretStorage API to ensure credentials are encrypted at rest.

#### Scenario: Password encryption
- **WHEN** a connection with a password is saved
- **THEN** the password is stored via SecretStorage with a key derived from the connection ID
- **AND** the password is never written to the JSON file

#### Scenario: Password retrieval
- **WHEN** the system needs to establish a database connection
- **THEN** the password is retrieved from SecretStorage using the connection ID

### Requirement: Connection Tree View
The system SHALL display saved connections in a tree view within the VSCode sidebar, providing visual access to connection management.

#### Scenario: Display connections in sidebar
- **WHEN** the extension activates
- **THEN** saved connections are displayed in the dbooly sidebar tree view
- **AND** each connection shows its name and database type icon

#### Scenario: Empty state
- **WHEN** no connections are saved
- **THEN** the tree view displays a welcome message with an "Add Connection" action

#### Scenario: Tree view updates on changes
- **WHEN** a connection is added, edited, or deleted
- **THEN** the tree view refreshes to reflect the change

#### Scenario: Context menu actions
- **WHEN** user right-clicks a connection in the tree view
- **THEN** a context menu appears with Edit and Delete options

#### Scenario: Add connection from tree view
- **WHEN** user clicks the "+" button in the tree view header
- **THEN** the add connection flow is triggered

### Requirement: Connection Form UI
The system SHALL display a webview-based form for creating and editing connections, showing all fields at once.

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
