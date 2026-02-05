# Capability: Table Data Sorting

## Overview
Interactive column sorting for the table data panel, allowing users to sort displayed data by clicking column headers.

## ADDED Requirements

### Requirement: Column Sort Toggle
The system SHALL allow users to click a column header to sort the table data by that column, cycling through ascending, descending, and unsorted states.

**Rationale**: Column sorting is a fundamental table interaction pattern that enables users to find specific values and understand data distribution without manually scanning rows.

#### Scenario: Sort column ascending
- **Given** the table data panel is displaying unsorted data
- **When** the user clicks a column header
- **Then** the data is re-fetched sorted by that column in ascending order
- **And** an ascending indicator (▲) appears next to the column name

#### Scenario: Sort column descending
- **Given** the table data panel is displaying data sorted ascending by a column
- **When** the user clicks that same column header
- **Then** the data is re-fetched sorted by that column in descending order
- **And** the indicator changes to descending (▼)

#### Scenario: Clear column sort
- **Given** the table data panel is displaying data sorted descending by a column
- **When** the user clicks that same column header
- **Then** the data is re-fetched in the database's natural order (no ORDER BY)
- **And** no sort indicator is displayed on any column

#### Scenario: Sort by different column
- **Given** the table data panel is displaying data sorted by column A
- **When** the user clicks column B header
- **Then** the data is re-fetched sorted by column B in ascending order
- **And** the sort indicator moves from column A to column B

---

### Requirement: Sort Indicator Display
The system SHALL display a visual indicator on the currently sorted column showing the sort direction.

**Rationale**: Users need visual feedback to understand the current sort state without relying on memory or inspecting data values.

#### Scenario: Ascending indicator
- **Given** the table data is sorted ascending by a column
- **When** the table renders
- **Then** that column header shows ▲ after the column name

#### Scenario: Descending indicator
- **Given** the table data is sorted descending by a column
- **When** the table renders
- **Then** that column header shows ▼ after the column name

#### Scenario: No indicator when unsorted
- **Given** the table data is not sorted by any column
- **When** the table renders
- **Then** no column headers show sort indicators

---

### Requirement: Server-Side Sorting
The system SHALL execute sort operations via SQL ORDER BY clause rather than client-side JavaScript sorting.

**Rationale**: Server-side sorting ensures consistency with database collation rules and works correctly regardless of the row limit.

#### Scenario: Sort generates ORDER BY clause
- **Given** a user requests data sorted by column "created_at" descending
- **When** the query is executed
- **Then** the SQL includes `ORDER BY \`created_at\` DESC`

#### Scenario: Sort column escaping
- **Given** a column name contains special characters (e.g., backticks)
- **When** the query is generated
- **Then** the column name MUST be properly escaped using database-specific escaping
- **And** no SQL injection is possible

#### Scenario: Null values follow database defaults
- **Given** a column contains NULL values
- **When** the user sorts by that column
- **Then** NULL values are ordered according to database default behavior (MySQL: NULLs first for ASC, last for DESC)

---

### Requirement: Sort State Persistence During Session
The system SHALL maintain the sort state when the view is updated within the same session.

**Rationale**: Users shouldn't lose their sort preference when the data refreshes or search filter changes.

#### Scenario: Sort preserved on data refresh
- **Given** the table data is sorted by column A ascending
- **When** the data is re-fetched (e.g., manual refresh)
- **Then** the new data is still sorted by column A ascending

#### Scenario: Sort preserved with search filter
- **Given** the table data is sorted by column A ascending
- **When** the user enters a search term in the filter
- **Then** the displayed rows are both sorted by column A and filtered by the search term

---

### Requirement: Sort Click Does Not Trigger Resize
The system SHALL ensure that clicking the column header for sorting does not conflict with the column resize functionality.

**Rationale**: Both features use mouse interactions on the header; they must be clearly distinguished to avoid frustrating user experiences.

#### Scenario: Click header content triggers sort
- **Given** the table data panel is displayed
- **When** the user clicks on the column name text
- **Then** the sort toggle is triggered
- **And** column resizing is not initiated

#### Scenario: Drag resize handle does not trigger sort
- **Given** the table data panel is displayed
- **When** the user mousedowns on the resize handle and drags
- **Then** column resizing is performed
- **And** no sort change occurs

---

## Notes

### Single-Column Sort Only
This implementation supports sorting by one column at a time. Multi-column sorting (e.g., ORDER BY col1 ASC, col2 DESC) is out of scope for this change.

### No Persistence Across Sessions
Sort preferences are not persisted when the panel is closed or VSCode is restarted. Session-only state was chosen to keep the implementation simple.

### Related Capabilities
- Connection Management (for database connectivity)
- Table Data Preview (add-table-data-preview) - the feature this sorting extends
