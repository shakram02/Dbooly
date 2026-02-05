# Change: Add Table Data Preview on Click

## Why
Users need to quickly inspect table contents without writing SQL queries. Currently, clicking a table in the tree view does nothing—users have no way to see what data a table contains. This creates friction in the exploration workflow where users want to understand database structure and verify data.

## What Changes
- Clicking a table in the tree view opens a data preview panel
- The panel displays the first 100 rows of the table (`SELECT * FROM table LIMIT 100`)
- Data is shown in a readable, tabular format within a webview
- Each database type (MySQL, PostgreSQL, SQLite) has its own query execution logic
- The panel title shows the table name for context

## Impact
- Affected specs: New `data-inspection` capability
- Affected code:
  - `src/connections/connection-tree-provider.ts` - Add click handler for table items
  - `src/providers/schema-provider.ts` - Add `queryTableData()` to interface
  - `src/providers/mysql-schema-provider.ts` - Implement MySQL data query
  - `src/views/table-data-panel.ts` - New webview panel for displaying data
  - `package.json` - Add command for viewing table data
