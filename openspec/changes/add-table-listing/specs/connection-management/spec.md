## MODIFIED Requirements

### Requirement: Connection Tree View
The system SHALL display saved connections in a tree view within the VSCode sidebar, providing visual access to connection management.

#### Scenario: Display connections in sidebar
- **WHEN** the extension activates
- **THEN** saved connections are displayed in the dbooly sidebar tree view
- **AND** each connection shows its name and database type icon
- **AND** each connection is expandable to reveal child nodes (tables)

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

#### Scenario: Connection expansion
- **WHEN** user expands a connection node
- **THEN** the connection's child items (tables) are loaded and displayed
