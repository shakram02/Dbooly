## ADDED Requirements

### Requirement: Table Listing
The system SHALL display database tables as expandable children under each connection in the tree view.

#### Scenario: Expand connection to view tables
- **GIVEN** a saved database connection exists
- **WHEN** user expands the connection node in the tree view
- **THEN** the system fetches the list of tables from the database
- **AND** displays each table as a child node under the connection

#### Scenario: Lazy loading of tables
- **GIVEN** a connection node is collapsed
- **WHEN** the tree view renders
- **THEN** no database query is made to fetch tables
- **AND** tables are only fetched when the user expands the connection

#### Scenario: Table fetch error
- **GIVEN** a connection with invalid credentials or unreachable host
- **WHEN** user expands the connection node
- **THEN** an error notification is displayed to the user
- **AND** the connection node can be collapsed and retried

#### Scenario: Empty database
- **GIVEN** a database with no user tables
- **WHEN** user expands the connection node
- **THEN** the connection shows no child nodes (empty expansion)

### Requirement: Table Display Information
Each table node SHALL display the table name and provide contextual information.

#### Scenario: Table node appearance
- **GIVEN** tables have been fetched from the database
- **WHEN** tables are displayed in the tree view
- **THEN** each table shows its name as the label
- **AND** displays a table icon (`symbol-class` or similar)
- **AND** shows the table type (e.g., "TABLE", "VIEW") as the description

#### Scenario: Table tooltip
- **GIVEN** a table node is displayed
- **WHEN** user hovers over the table node
- **THEN** a tooltip displays the fully qualified table name (schema.table if applicable)

### Requirement: Table Search Filter
The system SHALL provide filtering capabilities to find tables by name.

#### Scenario: Native tree filter
- **GIVEN** the tree view is focused
- **WHEN** user starts typing
- **THEN** VSCode's native filter filters visible nodes
- **AND** the filter is case-insensitive

#### Scenario: Filter scope
- **GIVEN** multiple connections exist with some expanded
- **WHEN** user applies a filter
- **THEN** only tables within expanded connections are filtered
- **AND** connection nodes themselves remain visible

### Requirement: Table Search UI
The system SHALL provide a dedicated search panel accessible via an inline action on each connection.

#### Scenario: Search button availability
- **GIVEN** a connection exists in the tree view
- **WHEN** the connection has not been expanded (tables not loaded)
- **THEN** the search button is not visible on the connection row
- **AND** the search button appears after the connection is expanded and tables are loaded

#### Scenario: Open search panel
- **GIVEN** a connection exists in the tree view with tables loaded
- **WHEN** user clicks the search icon on a connection row
- **THEN** a webview panel opens scoped to that connection
- **AND** displays a search input and the connection's tables

#### Scenario: Search within connection
- **GIVEN** the search panel is open for a connection
- **WHEN** user types a search query
- **THEN** only tables from that connection matching the query are displayed
- **AND** results show table name and type

#### Scenario: Select search result
- **GIVEN** search results are displayed
- **WHEN** user clicks a result or presses Enter on a selected result
- **THEN** the panel closes
- **AND** the selected table action is triggered

#### Scenario: Keyboard navigation
- **GIVEN** search results are displayed
- **WHEN** user presses arrow keys
- **THEN** selection moves through results
- **AND** pressing Escape closes the panel

### Requirement: Database-Specific Table Queries
The system SHALL use appropriate queries for each supported database type to retrieve table listings.

#### Scenario: MySQL table listing
- **GIVEN** a MySQL database connection
- **WHEN** fetching tables
- **THEN** the system uses `SHOW FULL TABLES` or queries `information_schema.tables`
- **AND** retrieves both regular tables and views

#### Scenario: PostgreSQL table listing
- **GIVEN** a PostgreSQL database connection
- **WHEN** fetching tables
- **THEN** the system queries `information_schema.tables` or `pg_catalog.pg_tables`
- **AND** retrieves tables from the connected database's public schema by default

#### Scenario: SQLite table listing
- **GIVEN** a SQLite database connection
- **WHEN** fetching tables
- **THEN** the system queries `sqlite_master WHERE type IN ('table', 'view')`
- **AND** excludes internal SQLite tables (e.g., `sqlite_sequence`)
