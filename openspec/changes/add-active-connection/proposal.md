# Change: Add Active Connection State for Global Query Scripts

## Why
Currently, query execution is tightly coupled to specific tables. Users cannot write and execute ad-hoc SQL queries that target a database connection directly. This proposal introduces an "active connection" concept that allows global query scripts to execute against a designated database, with visual feedback in the tree view and a connection selector in the script editor.

## What Changes
- Add "active connection" state management - only one connection can be active at a time across the workspace
- Opening/connecting to a database automatically sets it as the active connection, deactivating any previously active connection
- Inactive connections appear grayed out in the tree view for visual distinction
- Introduce a global query script editor panel where users can write and execute SQL
- Script editor includes a connection dropdown to override the default active connection for that script
- Query execution in scripts targets the active connection (or the explicitly selected one in the dropdown)

## Impact
- Affected specs: `connection-management` (active state, visual styling), new `query-scripting` capability
- Affected code:
  - `connection-manager.ts` - add active connection tracking
  - `connection-tree-provider.ts` - grayed out styling for inactive connections
  - New `script-editor-panel.ts` - webview for query script editing and execution
  - `extension.ts` - register new commands and panel
