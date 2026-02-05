## ADDED Requirements

### Requirement: Column Listing
The system SHALL display table columns as expandable children under each table node in the tree view.

#### Scenario: Expand table to view columns
- **GIVEN** a table node exists under an expanded connection
- **WHEN** user clicks the expand chevron on the table node
- **THEN** the system fetches the column metadata from the database
- **AND** displays each column as a child node under the table

#### Scenario: Loading state during column fetch
- **GIVEN** user expands a table node
- **WHEN** the column query is in progress
- **THEN** the tree displays a loading indicator (spinner icon)
- **AND** the indicator is replaced with columns when fetch completes

#### Scenario: Lazy loading of columns
- **GIVEN** a table node is collapsed
- **WHEN** the tree view renders
- **THEN** no database query is made to fetch columns
- **AND** columns are only fetched when the user expands the table

#### Scenario: Column fetch error
- **GIVEN** a table with access restrictions or deleted during session
- **WHEN** user expands the table node
- **THEN** an inline error item is displayed as a child of the table node
- **AND** the error item shows a message like "Failed to load columns"

#### Scenario: Table with no columns
- **GIVEN** a table with no columns (edge case)
- **WHEN** user expands the table node
- **THEN** the table shows a "No columns" placeholder item
- **AND** the placeholder is visually distinct from error/loading states

### Requirement: Column Display Information
Each column node SHALL display the column name and provide metadata as contextual information.

#### Scenario: Column node appearance
- **GIVEN** columns have been fetched from the database
- **WHEN** columns are displayed in the tree view
- **THEN** each column shows its name as the label
- **AND** displays a column icon (`symbol-field` or similar)
- **AND** shows the data type as the description (e.g., "VARCHAR(255)", "INT")

#### Scenario: Column tooltip
- **GIVEN** a column node is displayed
- **WHEN** user hovers over the column node
- **THEN** a tooltip displays full column information including:
  - Column name
  - Data type with length/precision
  - Nullable status
  - Key type (PRIMARY KEY, FOREIGN KEY, or none)
  - Default value (if any)

#### Scenario: Primary key indicator
- **GIVEN** a column is part of the primary key
- **WHEN** displayed in the tree view
- **THEN** the column shows a key icon (`key` or `symbol-key`) instead of the default field icon

#### Scenario: Foreign key indicator
- **GIVEN** a column is a foreign key
- **WHEN** displayed in the tree view
- **THEN** the column shows a link icon (`references` or `symbol-reference`) to indicate the relationship

### Requirement: Column Caching
The system SHALL cache fetched column metadata using an LRU cache with size limits and TTL.

#### Scenario: Cache hit on re-expansion
- **GIVEN** a table's columns were previously loaded
- **WHEN** user collapses and re-expands the same table
- **THEN** columns are displayed from cache without a database query

#### Scenario: Cache size limit
- **GIVEN** column cache has reached maximum size (100 tables)
- **WHEN** a new table's columns are fetched
- **THEN** the least recently used cache entry is evicted
- **AND** the new columns are cached

#### Scenario: Cache TTL expiration
- **GIVEN** a table's columns were cached more than 10 minutes ago
- **WHEN** user expands that table again
- **THEN** fresh data is fetched from the database
- **AND** the cache entry is updated

#### Scenario: Cache invalidation on connection refresh
- **GIVEN** a table's columns are cached
- **WHEN** user triggers a connection refresh
- **THEN** the column cache for that connection is cleared
- **AND** next expansion fetches fresh data from the database

### Requirement: Table Selection Behavior
The system SHALL NOT auto-open data panels when a table is selected in the tree view.

#### Scenario: Single-click on table row
- **GIVEN** a table node exists in the tree view
- **WHEN** user single-clicks anywhere on the table row
- **THEN** the table node expands or collapses (toggle)
- **AND** no data panel is opened

#### Scenario: View table data via context menu
- **GIVEN** a table node exists in the tree view
- **WHEN** user right-clicks and selects "View Data"
- **THEN** the table data panel opens

#### Scenario: View table data via keyboard
- **GIVEN** a table node is selected in the tree view
- **WHEN** user presses Enter
- **THEN** the table data panel opens

### Requirement: Database-Specific Column Queries
The system SHALL use optimized single-query approaches for each supported database type to retrieve column metadata including key information.

#### Scenario: MySQL column listing
- **GIVEN** a MySQL database connection
- **WHEN** fetching columns for a table
- **THEN** the system uses a single query joining `information_schema.columns` with `key_column_usage`
- **AND** retrieves column name, data type, nullable, key info, foreign key references, and default value

#### Scenario: PostgreSQL column listing
- **GIVEN** a PostgreSQL database connection
- **WHEN** fetching columns for a table
- **THEN** the system uses a single query joining `information_schema.columns` with constraint tables
- **AND** retrieves column name, data type, nullable, key info, foreign key references, and default value

#### Scenario: SQLite column listing
- **GIVEN** a SQLite database connection
- **WHEN** fetching columns for a table
- **THEN** the system uses `PRAGMA table_info(table_name)` combined with `PRAGMA foreign_key_list`
- **AND** retrieves column name, data type, nullable, primary key, foreign key, and default value
