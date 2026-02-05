## ADDED Requirements

### Requirement: Table Data Preview
The system SHALL allow users to preview table data by clicking on a table in the tree view, displaying the first 100 rows in a webview panel.

#### Scenario: Click table to view data
- **WHEN** user clicks on a table item in the connections tree view
- **THEN** a webview panel opens showing the first 100 rows of that table
- **AND** the panel title includes the table name

#### Scenario: Display column headers
- **WHEN** table data is displayed
- **THEN** column names from the database are shown as table headers
- **AND** data rows are displayed beneath the headers in a tabular format

#### Scenario: Loading state
- **WHEN** the data panel opens and the query is executing
- **THEN** a loading indicator is displayed
- **AND** the loading indicator is replaced by data when the query completes

#### Scenario: Query error handling
- **WHEN** the data query fails (connection error, permission denied, etc.)
- **THEN** an error message is displayed in the panel
- **AND** the error includes actionable information about the failure

#### Scenario: Empty table
- **WHEN** the table contains no rows
- **THEN** the panel displays column headers
- **AND** a message indicates the table is empty

### Requirement: Data Query Provider
The system SHALL provide database-specific implementations for querying table data with a row limit.

#### Scenario: MySQL data query
- **WHEN** querying a MySQL table for preview
- **THEN** the system executes `SELECT * FROM \`tablename\` LIMIT 100`
- **AND** table name is properly escaped to prevent SQL injection

#### Scenario: Query result structure
- **WHEN** a data query completes successfully
- **THEN** the result contains column names (from metadata)
- **AND** the result contains row data as an array of values

### Requirement: View Table Data Command
The system SHALL provide a command to view table data that can be invoked from context menu or programmatically.

#### Scenario: Context menu access
- **WHEN** user right-clicks on a table item in the tree view
- **THEN** a "View Data" option appears in the context menu
- **AND** selecting it opens the data preview panel

#### Scenario: Reuse existing panel
- **WHEN** user clicks another table while a data panel is open
- **THEN** the existing panel updates to show the new table's data
- **AND** only one data panel is open at a time per connection
