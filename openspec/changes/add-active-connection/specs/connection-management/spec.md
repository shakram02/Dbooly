## ADDED Requirements

### Requirement: Active Connection State
The system SHALL maintain an "active connection" state, where exactly zero or one connection is designated as active at any time. The active connection serves as the default target for query execution in global scripts.

#### Scenario: Single active connection constraint
- **WHEN** a connection is set as active
- **THEN** any previously active connection is automatically deactivated
- **AND** only the newly activated connection has active status

#### Scenario: Initial state with no active connection
- **WHEN** the extension activates with saved connections
- **THEN** no connection is initially active
- **AND** users must explicitly or implicitly activate a connection

#### Scenario: Activate connection on successful expansion
- **WHEN** a connection tree node is expanded successfully (tables loaded)
- **THEN** that connection becomes the active connection
- **AND** any previously active connection is deactivated

#### Scenario: Set active connection via command
- **WHEN** user executes `dbooly.setActiveConnection` command with a connection ID
- **THEN** that connection becomes the active connection
- **AND** tree view updates to reflect the change

#### Scenario: Active connection events
- **WHEN** the active connection changes
- **THEN** an `onDidChangeActiveConnection` event is emitted
- **AND** subscribed components (tree view, script editor) are notified

## MODIFIED Requirements

### Requirement: Connection Tree View
The system SHALL display saved connections in a tree view within the VSCode sidebar, providing visual access to connection management. Active and inactive connections are visually distinguished.

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
- **THEN** a context menu appears with Edit, Delete, and Set as Active options

#### Scenario: Add connection from tree view
- **WHEN** user clicks the "+" button in the tree view header
- **THEN** the add connection flow is triggered

#### Scenario: Active connection visual indicator
- **WHEN** a connection is the active connection
- **THEN** it is displayed with normal text styling
- **AND** a green dot badge overlay appears on the connection icon
- **AND** screen readers announce "active" status via ARIA label

#### Scenario: Inactive connection visual styling
- **WHEN** a connection is not the active connection
- **THEN** it is displayed with deemphasized (grayed out) text color using `listDeemphasizedForeground`
- **AND** no badge overlay appears on the connection icon
- **AND** users can still expand and interact with it normally
- **AND** hovering shows full connection name (not truncated)
