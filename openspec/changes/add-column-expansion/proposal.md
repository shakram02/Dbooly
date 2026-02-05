# Change: Add Column Expansion to Table Nodes

## Why
Users need to inspect table schemas directly from the tree view without opening a separate panel. Clicking the chevron beside a table name should reveal its columns, allowing quick schema discovery during development.

## What Changes
- Table nodes become expandable (have a chevron)
- Expanding a table fetches and displays its columns as child nodes
- Each column shows name, data type, and nullable/key constraints
- Column data is lazily loaded on expansion with loading indicator
- **BREAKING**: Remove auto-open data panel on table selection (conflicts with expansion UX)

## UX Considerations
- **Click behavior**: Single-click on tree row should expand/collapse, not trigger data panel. Remove `onDidChangeSelection` auto-open behavior for tables. Data panel requires explicit action (double-click, context menu, or Enter key).
- **Loading state**: Show spinner icon during column fetch (queries take 100-2000ms)
- **Error state**: Display inline error item in tree, not just notification (contextual feedback)
- **Empty state**: Show "No columns" placeholder to distinguish from loading/error states

## Performance Considerations
- **LRU cache**: Bound column cache to ~100 tables with 10-minute TTL to prevent memory growth
- **Single query**: Use optimized queries that fetch column + key metadata in one round-trip
- **Cache invalidation**: Clear on connection refresh, DDL detection, and TTL expiry

## Impact
- Affected specs: `schema-inspection`
- Affected code:
  - `src/connections/connection-tree-provider.ts` - Add column tree items, expansion logic, remove selection handler
  - `src/providers/schema-provider.ts` - Add `listColumns` interface method
  - `src/providers/mysql-schema-provider.ts` - Implement optimized column listing query
  - `src/models/column.ts` (new) - Column model definition
