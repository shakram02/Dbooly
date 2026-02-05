# Change: Add Table Listing with Search

## Why
Users need to browse and quickly find tables within their database connections. Currently, connections are listed but cannot be expanded to reveal database structure, making it impossible to explore schemas without writing queries.

## What Changes
- Connections in the tree view become expandable, showing tables as child nodes
- Tables are fetched on-demand when a connection is expanded (lazy loading)
- Native type-to-filter works when tree view is focused
- A dedicated Search Tables UI (webview panel) scoped to a single connection
- Search button (inline icon) on each connection row for quick access
- Each database type (MySQL, PostgreSQL, SQLite) has its own table listing query

## Impact
- Affected specs: `connection-management` (tree view enhancement), new `schema-inspection` capability
- Affected code:
  - `src/connections/connection-tree-provider.ts` - Add expandable connections and table items
  - `src/connections/connection-pool.ts` - Connection pooling for reuse
  - `src/providers/` - Add database-specific schema providers
  - `src/views/table-search-panel.ts` - Search UI webview
  - `package.json` - Add search command and button
