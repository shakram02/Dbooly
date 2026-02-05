# Change: Add Script Editor Panel for Query Execution

## Why
The active connection infrastructure is now in place (see `add-active-connection` sections 1-4), but users still cannot execute arbitrary SQL queries. This proposal implements the Script Editor Panel UI - a webview-based query editor with connection selection, split-pane results display, transaction management, and destructive operation safeguards.

## What Changes
- New `ScriptEditorPanel` webview class with multi-instance support
- Split pane layout: SQL editor on top, results table on bottom
- Connection dropdown with database type indicators
- Query execution with loading states and cancellation
- Results table with virtualized rendering for large datasets
- Transaction mode management (Auto/Manual/Smart)
- Destructive operation safety dialogs (DELETE, DROP, TRUNCATE warnings)
- Keyboard shortcuts (Ctrl+Enter execute, Escape cancel)
- Full accessibility support (ARIA labels, tab order, focus indicators)
- Commands and package.json contributions

## Impact
- Affected specs: `query-scripting` (implements all UI requirements from original proposal)
- Affected code:
  - New `src/views/script-editor-panel.ts` - main panel class
  - `src/extension.ts` - command registration and panel disposal
  - `package.json` - command contributions and menu items
- Dependencies: Uses `ConnectionManager`, `ConnectionPool`, `SchemaProvider.executeQuery()` from `add-active-connection`
