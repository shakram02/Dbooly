## ADDED Requirements

### Requirement: Table Starring
The system SHALL allow users to star and unstar tables within a database connection to mark them as favorites.

#### Scenario: Star table from tree view
- **WHEN** user right-clicks a table in the tree view
- **AND** selects "Star Table"
- **THEN** the table is marked as starred
- **AND** the table displays a star icon indicator
- **AND** the table moves to the top of the table list

#### Scenario: Unstar table from tree view
- **WHEN** user right-clicks a starred table in the tree view
- **AND** selects "Unstar Table"
- **THEN** the table is unmarked as starred
- **AND** the star icon is removed
- **AND** the table returns to its alphabetical position

#### Scenario: Star table from search panel
- **WHEN** user views a table in the search panel results
- **THEN** a star toggle button is visible next to each table
- **AND** clicking the star button toggles the starred status

### Requirement: Starred Tables Sorting
The system SHALL display starred tables before unstarred tables in all table listings.

#### Scenario: Tree view sorting
- **WHEN** a connection's tables are displayed in the tree view
- **THEN** starred tables appear first (alphabetically among themselves)
- **AND** unstarred tables appear after (alphabetically among themselves)

#### Scenario: Search panel sorting
- **WHEN** user searches for tables in the search panel
- **THEN** matching starred tables appear first in results
- **AND** matching unstarred tables appear after
- **AND** the total result count reflects all matches

#### Scenario: Search preserves functionality
- **WHEN** user types a search query
- **THEN** only tables matching the query are shown
- **AND** starred tables matching the query appear first
- **AND** keyboard navigation (↑↓, Enter, Esc) works as before

### Requirement: Starred Tables Persistence
The system SHALL persist starred tables per connection to workspace storage.

#### Scenario: Persist starred status
- **WHEN** a table is starred or unstarred
- **THEN** the change is saved to `.vscode/dbooly-connections.json`
- **AND** starred tables are stored by connection ID

#### Scenario: Load starred status on startup
- **WHEN** the extension activates
- **THEN** previously starred tables are loaded from storage
- **AND** starred tables display their star indicator

#### Scenario: Connection deletion cleans up
- **WHEN** a connection is deleted
- **THEN** the starred tables list for that connection is also removed
