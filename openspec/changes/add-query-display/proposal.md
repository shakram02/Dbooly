# Change: Display Executed Query Above Data Panel

## Why
Users need visibility into the exact SQL query being executed when viewing table data. This helps with:
- Understanding what data they're seeing (including sort order, limits)
- Learning SQL syntax by example
- Debugging unexpected results
- Copying queries for use elsewhere

## What Changes
- Add a collapsible query display section above the table data
- Show the full SQL query including ORDER BY clause when sorting is active
- Update the displayed query dynamically when sort order changes
- Include LIMIT clause in the displayed query

## Impact
- Affected specs: Creates new `query-display` capability
- Affected code:
  - `src/views/table-data-panel.ts` - Add query display UI section
  - `src/providers/mysql-schema-provider.ts` - Return executed query string along with results
  - `src/providers/schema-provider.ts` - Update QueryResult interface
