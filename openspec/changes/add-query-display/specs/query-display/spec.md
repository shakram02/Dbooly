## ADDED Requirements

### Requirement: Query Display Above Data
The system SHALL display the executed SQL query in a dedicated section above the data table when viewing table data.

**Rationale**: Showing the actual query helps users understand what data they're viewing, learn SQL patterns, and debug unexpected results.

#### Scenario: Display query on table open
- **Given** the user opens a table in the data panel
- **When** the data loads successfully
- **Then** the executed SQL query is displayed above the table
- **And** the query shows the table name, ORDER BY clause (if sorted), and LIMIT

#### Scenario: Query includes sort clause
- **Given** the table data is sorted by column "name" ascending
- **When** the query display renders
- **Then** the displayed query includes `ORDER BY \`name\` ASC`

#### Scenario: Query updates on sort change
- **Given** the query display shows `SELECT * FROM \`users\` LIMIT 100`
- **When** the user clicks the "email" column header to sort
- **Then** the displayed query updates to `SELECT * FROM \`users\` ORDER BY \`email\` ASC LIMIT 100`

#### Scenario: Query clears sort clause when unsorted
- **Given** the query display shows `SELECT * FROM \`users\` ORDER BY \`name\` DESC LIMIT 100`
- **When** the user clicks the sorted column header to clear the sort (third click)
- **Then** the displayed query updates to `SELECT * FROM \`users\` LIMIT 100`

---

### Requirement: Query Display Styling
The system SHALL style the query display to be visually distinct from the data table while remaining unobtrusive.

**Rationale**: The query should be easy to find and read but not dominate the view or distract from the data.

#### Scenario: Monospace font for query
- **Given** the query display is rendered
- **When** the user views the query text
- **Then** the query is displayed in a monospace font for readability

#### Scenario: Query has subtle background
- **Given** the query display is rendered
- **When** the user views the panel
- **Then** the query section has a subtle background color distinct from the data area
- **And** the styling uses VSCode theme variables for consistency

#### Scenario: Query text is selectable
- **Given** the query is displayed above the table
- **When** the user clicks and drags to select the query text
- **Then** the text can be selected and copied

---

### Requirement: Query Display Compactness
The system SHALL present the query in a compact, space-efficient manner that doesn't reduce the visible data area significantly.

**Rationale**: The primary purpose of the panel is viewing data; the query display should be helpful without consuming excessive vertical space.

#### Scenario: Single-line display for typical queries
- **Given** a query that fits on a single line
- **When** the query display renders
- **Then** the query is shown on a single line without wrapping

#### Scenario: Reasonable maximum height
- **Given** a very long query (e.g., many columns or long table name)
- **When** the query display renders
- **Then** the query section does not exceed a reasonable height
- **And** horizontal scrolling is available if needed
