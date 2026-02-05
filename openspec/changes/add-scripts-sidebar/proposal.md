# Change: Add Scripts Section to Sidebar

## Why
Users need a way to save and organize SQL scripts for quick access. Currently, the Script Editor Panel (from `add-script-editor-panel`) provides query execution but lacks persistence. Adding a Scripts section to the sidebar enables users to save, organize, and quickly open their frequently-used queries.

## What Changes
- New "Scripts" tree view section below "Connections" in the dbooly sidebar
- Global script storage using VSCode's `globalState` API
- Hierarchical organization supporting both standalone scripts and folders
- Script CRUD operations (create, rename, delete)
- Folder CRUD operations (create, rename, delete)
- Double-click to open script in Script Editor Panel
- Scripts execute against the active connection (or user-selected via dropdown from `add-script-editor-panel`)

## Impact
- Affected specs: `scripts-sidebar` (new capability)
- Affected code:
  - New `src/scripts/script-storage.ts` - persistence layer using globalState
  - New `src/scripts/script-tree-provider.ts` - tree view provider
  - New `src/scripts/script-commands.ts` - command handlers
  - `src/extension.ts` - registration of new tree view and commands
  - `package.json` - commands, views, and menu contributions
- Dependencies: Integrates with Script Editor Panel from `add-script-editor-panel`
