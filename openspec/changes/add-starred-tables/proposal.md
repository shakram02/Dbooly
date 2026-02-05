# Change: Add Starred Tables Feature

## Why
Users with many tables need a way to quickly access their most frequently used tables. Currently tables are listed alphabetically, making it difficult to find important tables in databases with hundreds of tables. Starring tables provides a simple organizational mechanism that persists across sessions.

## What Changes
- Add ability to star/unstar tables from both tree view and search panel
- Starred tables appear first in the table list (before unstarred tables)
- Starred status is persisted per connection in workspace storage
- Search panel filters continue to work; starred tables within filtered results appear first

## Impact
- Affected specs: Creates new `table-favorites` capability
- Affected code:
  - `src/connections/connection-storage.ts` - Store starred table names
  - `src/connections/connection-tree-provider.ts` - Sort starred first, add star/unstar command
  - `src/views/table-search-panel.ts` - Display star indicator, add star toggle button
