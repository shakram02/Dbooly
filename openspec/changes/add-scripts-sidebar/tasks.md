## 1. Data Models and Storage

- [x] 1.1 Create `src/models/script.ts` with `Script` and `Folder` interfaces
- [x] 1.2 Create `src/scripts/script-storage.ts` with globalState persistence
- [x] 1.3 Implement UUID generation for script/folder IDs
- [x] 1.4 Implement `getAllScripts()` and `getAllFolders()` methods
- [x] 1.5 Implement `saveScript()`, `deleteScript()`, `updateScript()` methods
- [x] 1.6 Implement `saveFolder()`, `deleteFolder()`, `updateFolder()` methods
- [x] 1.7 Implement `deleteFolderRecursive()` for cascading delete

## 2. Tree View Provider

- [x] 2.1 Create `src/scripts/script-tree-provider.ts`
- [x] 2.2 Implement `ScriptTreeItem` class for script display
- [x] 2.3 Implement `FolderTreeItem` class for folder display
- [x] 2.4 Implement `getChildren()` with hierarchical folder support
- [x] 2.5 Implement `getTreeItem()` with icons and context values
- [x] 2.6 Implement `onDidChangeTreeData` event for refresh
- [x] 2.7 Add sorting (folders first, then alphabetical)

## 3. Package.json Contributions

- [x] 3.1 Add `dbooly.scripts` view to views configuration
- [x] 3.2 Add script commands: addScript, addFolder, renameScript, deleteScript, openScript
- [x] 3.3 Add folder commands: renameFolder, deleteFolder, newScriptInFolder, newFolderInFolder
- [x] 3.4 Add view/title menu items for Add Script and Add Folder buttons
- [x] 3.5 Add view/item/context menus for script and folder actions
- [x] 3.6 Add viewsWelcome content for empty state

## 4. Command Handlers

- [x] 4.1 Create `src/scripts/script-commands.ts`
- [x] 4.2 Implement `dbooly.addScript` command with input box
- [x] 4.3 Implement `dbooly.addFolder` command with input box
- [x] 4.4 Implement `dbooly.renameScript` command
- [x] 4.5 Implement `dbooly.deleteScript` command with confirmation
- [x] 4.6 Implement `dbooly.renameFolder` command
- [x] 4.7 Implement `dbooly.deleteFolder` command with recursive warning
- [x] 4.8 Implement `dbooly.openScript` command (opens Script Editor Panel)
- [x] 4.9 Implement `dbooly.newScriptInFolder` context menu command
- [x] 4.10 Implement `dbooly.newFolderInFolder` context menu command

## 5. Extension Integration

- [x] 5.1 Update `src/extension.ts` to create ScriptStorage instance
- [x] 5.2 Register ScriptTreeProvider with `createTreeView()`
- [x] 5.3 Register all script commands
- [x] 5.4 Add disposal cleanup for tree provider

## 6. Script Editor Integration

- [x] 6.1 Update Script Editor Panel to accept script ID parameter (placeholder: opens in text editor)
- [x] 6.2 Add save command that persists to script storage (deferred: Script Editor Panel not yet implemented)
- [x] 6.3 Add "Save As Script" command for new scripts (deferred: Script Editor Panel not yet implemented)
- [x] 6.4 Update panel title to show script name when editing saved script (placeholder: text editor uses script name)
- [x] 6.5 Track dirty state for unsaved changes indicator (deferred: Script Editor Panel not yet implemented)

> **Note**: Section 6 tasks are partially implemented. Scripts currently open in VSCode's built-in text editor as a placeholder. Full integration will be completed when the Script Editor Panel from `add-script-editor-panel` is implemented.
