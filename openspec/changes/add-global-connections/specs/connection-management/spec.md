## MODIFIED Requirements

### Requirement: Connection Configuration
The system SHALL allow users to configure database connections with the following properties:
- Connection name (user-defined identifier)
- Database type (MySQL, SQLite)
- Host address (MySQL)
- Port number (MySQL)
- Database name (MySQL)
- Username (MySQL)
- Password (stored securely) (MySQL)
- File path (SQLite)
- Connection scope: `global` (default) or `project`

#### Scenario: Create new connection with global scope (default)
- **WHEN** user provides valid connection details and accepts the default "Global" scope
- **THEN** the connection configuration is stored in the extension's global storage directory
- **AND** passwords are saved to VSCode SecretStorage

#### Scenario: Create new connection with project scope
- **WHEN** user provides valid connection details and selects "Project" scope
- **THEN** the connection configuration is stored in `.vscode/dbooly-connections.json`
- **AND** the password is saved to VSCode SecretStorage

#### Scenario: Connection name uniqueness across scopes
- **WHEN** user creates a connection with a name that already exists in either project or global scope
- **THEN** the system displays an error message
- **AND** the connection is not created

### Requirement: Connection Persistence
The system SHALL persist connection configurations to two locations based on scope:
- **Project connections**: `.vscode/dbooly-connections.json` in the current project (excludes credentials)
- **Global connections**: A JSON file in `context.globalStorageUri` (excludes credentials), accessible from all projects

#### Scenario: Save project connection to file
- **WHEN** a project-scoped connection is created or updated
- **THEN** the connection metadata (excluding password) is written to `.vscode/dbooly-connections.json`

#### Scenario: Save global connection to file
- **WHEN** a global-scoped connection is created or updated
- **THEN** the connection metadata (excluding password) is written to `<globalStorageUri>/dbooly-global-connections.json`

#### Scenario: Load connections on startup
- **WHEN** the extension activates
- **THEN** previously saved project connections are loaded from `.vscode/dbooly-connections.json`
- **AND** previously saved global connections are loaded from `<globalStorageUri>/dbooly-global-connections.json`
- **AND** both sets of connections are merged and available for use

#### Scenario: Project without connections file
- **WHEN** the extension activates and no project connections file exists
- **THEN** global connections are still loaded and displayed
- **AND** no error is displayed

#### Scenario: No project open
- **WHEN** the extension activates with no project folder open
- **THEN** only global connections are loaded and available
- **AND** creating project-scoped connections is disabled

### Requirement: Connection Tree View
The system SHALL display saved connections in a tree view within the VSCode sidebar, providing visual access to connection management.

#### Scenario: Display connections in sidebar
- **WHEN** the extension activates
- **THEN** project connections are listed first, followed by global connections
- **AND** each connection shows its name, database type icon, and a scope indicator

#### Scenario: Scope indicator for global connections
- **WHEN** global connections are displayed in the tree view
- **THEN** each global connection shows a globe icon overlay to distinguish it from project connections

#### Scenario: Empty state
- **WHEN** no connections are saved in either scope
- **THEN** the tree view displays a welcome message with an "Add Connection" action

#### Scenario: Tree view updates on changes
- **WHEN** a connection is added, edited, or deleted in either scope
- **THEN** the tree view refreshes to reflect the change

#### Scenario: Context menu actions
- **WHEN** user right-clicks a connection in the tree view
- **THEN** a context menu appears with Edit, Delete, and scope conversion options

#### Scenario: Add connection from tree view
- **WHEN** user clicks the "+" button in the tree view header
- **THEN** the add connection flow is triggered with scope selection

## ADDED Requirements

### Requirement: Connection Scope Conversion
The system SHALL allow users to convert a connection between project and global scope without losing configuration or credentials.

#### Scenario: Convert project connection to global
- **WHEN** user selects "Make Global" on a project connection
- **THEN** a confirmation dialog is shown asking to confirm the conversion
- **AND** upon confirmation, the connection is removed from `.vscode/dbooly-connections.json`
- **AND** the connection is added to `<globalStorageUri>/dbooly-global-connections.json`
- **AND** the password remains in SecretStorage (unchanged, same key)
- **AND** starred tables are migrated to the global storage

#### Scenario: Convert global connection to project
- **WHEN** user selects "Make Project" on a global connection
- **THEN** a confirmation dialog is shown asking to confirm the conversion
- **AND** upon confirmation, the connection is removed from global storage
- **AND** the connection is added to `.vscode/dbooly-connections.json`
- **AND** the password remains in SecretStorage (unchanged, same key)
- **AND** starred tables are migrated to project storage

#### Scenario: Cancel scope conversion
- **WHEN** user dismisses or cancels the confirmation dialog during scope conversion
- **THEN** the connection remains in its original scope
- **AND** no changes are made

#### Scenario: Convert to project when no project is open
- **WHEN** user selects "Make Project" on a global connection and no project is open
- **THEN** the system displays an error message indicating a project must be open
- **AND** the connection remains global

### Requirement: Legacy Connection Migration
The system SHALL auto-migrate existing connections that lack a `scope` field by stamping them with `scope: 'project'` and re-saving the file on load.

#### Scenario: Migrate legacy connections on load
- **WHEN** the extension loads connections from `.vscode/dbooly-connections.json`
- **AND** one or more connections do not have a `scope` field
- **THEN** each connection without `scope` is assigned `scope: 'project'`
- **AND** the file is re-saved with the updated connections

#### Scenario: Already-migrated connections are not re-saved
- **WHEN** the extension loads connections and all connections already have a `scope` field
- **THEN** no re-save occurs

### Requirement: Connection Form Scope Selection
The system SHALL include a "Connection Scope" radio group in the connection creation and editing form.

#### Scenario: Scope selection on new connection
- **WHEN** user opens the add connection form
- **THEN** the form includes a "Connection Scope" radio group with options "Global" (selected by default) and "Project"
- **AND** "Project" is disabled if no project is open

#### Scenario: Scope display on edit connection
- **WHEN** user opens the edit connection form for an existing connection
- **THEN** the current scope is shown in the radio group
- **AND** the user can change the scope (which triggers a scope conversion on save)

#### Scenario: Scope selection when no project is open
- **WHEN** user opens the add connection form with no project open
- **THEN** the "Global" option is selected and "Project" is disabled
- **AND** a note explains that project connections require an open project
