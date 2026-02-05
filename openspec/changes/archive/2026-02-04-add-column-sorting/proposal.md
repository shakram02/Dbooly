# Proposal: Add Column Sorting

## Change ID
`add-column-sorting`

## Summary
Add interactive column sorting to the table data panel, allowing users to click column headers to sort data in ascending or descending order. Sort direction is indicated by visual arrows (▲/▼) beside the column name.

## Motivation
Currently, the table data panel displays rows in the database's natural order (typically primary key order) with no ability to sort. Users frequently need to find specific values or understand data distribution, which requires manual visual scanning. Interactive column sorting is a fundamental table UX expectation that significantly improves data exploration.

## Scope

### In Scope
- Clickable column headers that trigger sorting
- Visual sort direction indicators (▲ ascending, ▼ descending)
- Server-side sorting via ORDER BY clause (not client-side JavaScript sort)
- Single-column sorting (one column at a time)
- Cycling through: unsorted → ascending → descending → unsorted

### Out of Scope
- Multi-column sorting (sort by multiple columns)
- Persistent sort preferences across sessions
- Custom sort functions (e.g., natural sort for mixed alphanumeric)
- Null value ordering preferences (database defaults apply)

## User Stories

### US-1: Sort by column ascending
As a user viewing table data, I want to click a column header to sort by that column ascending, so I can find minimum values or see alphabetical ordering.

### US-2: Sort by column descending
As a user viewing table data, I want to click an ascending-sorted column to switch to descending, so I can find maximum values or reverse alphabetical ordering.

### US-3: Clear sort
As a user viewing sorted table data, I want to click the sorted column again to clear the sort, so I can return to the database's natural order.

### US-4: Visual sort indicator
As a user viewing table data, I want to see which column is sorted and in which direction, so I understand the current data ordering.

## Technical Approach

### Architecture
The change touches three layers:
1. **UI (Webview)**: Column header click handlers, sort indicator rendering
2. **Panel (Extension)**: Sort state management, message handling
3. **Provider (Backend)**: Query modification with ORDER BY clause

### Data Flow
1. User clicks column header in webview
2. Webview sends `sort` message to extension with column name and direction
3. Extension stores sort state and calls getData with sort parameters
4. Provider generates query with ORDER BY clause
5. Results sent back to webview for rendering
6. Webview updates sort indicator on the sorted column

### Security
- Column names must be properly escaped (backtick escaping for MySQL)
- Column name validated against actual column list from query result
- No user-provided strings directly interpolated into SQL

## Dependencies
- Existing `TableDataPanel` webview infrastructure
- Existing `SchemaProvider.queryTableData()` method signature (will be extended)
- VSCode webview message passing (already in use)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQL injection via column name | High | Validate column against schema, use identifier escaping |
| Performance on large tables | Medium | Already limited to 100/1000 rows; ORDER BY on indexed columns is fast |
| UX confusion with client-side filter | Low | Sort indicator distinct from filter; add tooltip explaining server-side sort |

## Success Criteria
- [ ] Clicking column header triggers server-side sort
- [ ] Sort indicator visible on sorted column
- [ ] Three-state toggle (none → asc → desc → none)
- [ ] Sort works correctly with NULL values (database default ordering)
- [ ] Sort persists when search filter is applied
- [ ] No SQL injection possible via column names
