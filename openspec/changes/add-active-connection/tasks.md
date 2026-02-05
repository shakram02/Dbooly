## 1. Active Connection State Management (ConnectionManager extension)
- [x] 1.1 Add `_activeConnectionId: ConnectionId | null` private property
- [x] 1.2 Add `_onDidChangeActiveConnection` EventEmitter (VSCode pattern)
- [x] 1.3 Expose `onDidChangeActiveConnection` as readonly event
- [x] 1.4 Implement `setActiveConnection(id: ConnectionId | null)` with event firing
- [x] 1.5 Implement `getActiveConnectionId(): ConnectionId | null` getter
- [x] 1.6 Auto-clear active connection when that connection is deleted
- [x] 1.7 Register EventEmitter disposal in extension context

## 2. Tree View Visual Updates
- [x] 2.1 Subscribe `ConnectionTreeProvider` to `onDidChangeActiveConnection` event
- [x] 2.2 Update `ConnectionTreeItem` to accept `isActive` boolean parameter
- [x] 2.3 Apply `listDeemphasizedForeground` theme color to inactive connection labels
- [x] 2.4 Create green dot badge overlay icon for active connection indicator
- [x] 2.5 Add ARIA label for active status (accessibility)
- [x] 2.6 Trigger tree refresh when active connection changes
- [ ] 2.7 Verify styling works in both light and dark themes

## 3. Automatic Connection Activation
- [x] 3.1 Activate connection when tree node expansion succeeds (in `getChildren`)
- [x] 3.2 Add "Set as Active" context menu item for connections
- [x] 3.3 Register `dbooly.setActiveConnection` command
- [x] 3.4 Contribute command to `package.json` with `view/item/context` menu

## 4. Query Execution Provider Extension
- [x] 4.1 Add `executeQuery()` method to `SchemaProvider` interface
- [x] 4.2 Define `QueryExecutionOptions` interface (limit, timeout, transactionMode)
- [x] 4.3 Define `QueryExecutionResult` interface (type, columns, rows, affectedRows, etc.)
- [x] 4.4 Implement `executeQuery()` in `MySQLSchemaProvider`
- [x] 4.5 Implement query type detection (SELECT/INSERT/UPDATE/DELETE/DDL)
- [x] 4.6 Add AbortController support for query cancellation

## 5. Script Editor Panel - Core Structure
- [ ] 5.1 Create `script-editor-panel.ts` with multi-instance support (static Set, not singleton)
- [ ] 5.2 Implement `ScriptEditorPanel.create()` factory method
- [ ] 5.3 Implement `ScriptEditorPanel.disposeAll()` for extension cleanup
- [ ] 5.4 Accept `ConnectionManager` and `ConnectionPool` via constructor (DI pattern)
- [ ] 5.5 Implement HTML structure: toolbar, SQL textarea, results area
- [ ] 5.6 Style with VSCode theme variables (monospace font, proper spacing)
- [ ] 5.7 Set initial focus to SQL textarea on panel open
- [ ] 5.8 Subscribe to `onDidChangeActiveConnection` for dropdown sync

## 6. Script Editor Panel - Split Pane Layout
- [ ] 5.1 Implement split pane container (top: SQL, bottom: results)
- [ ] 5.2 Initially hide results pane (SQL fills panel)
- [ ] 5.3 Show results pane after first query execution
- [ ] 5.4 Implement draggable divider between panes
- [ ] 5.5 Enforce minimum heights for both panes
- [ ] 5.6 Persist pane ratio during panel session

## 7. Script Editor Panel - Connection Dropdown
- [ ] 6.1 Populate dropdown from `ConnectionManager.getConnections()`
- [ ] 6.2 Initialize with active connection selected (if exists)
- [ ] 6.3 Show placeholder "Select connection..." when no active connection
- [ ] 6.4 Subscribe to connection add/remove events to update dropdown
- [ ] 6.5 Handle selected connection deletion - fallback gracefully
- [ ] 6.6 Show database type in dropdown options

## 8. Script Editor Panel - Query Execution
- [ ] 7.1 Implement message protocol: 'execute', 'cancel', 'changeConnection'
- [ ] 7.2 Execute SQL against selected connection using `ConnectionPool`
- [ ] 7.3 Measure and report execution time
- [ ] 7.4 Handle and display SQL errors with distinct styling
- [ ] 7.5 Implement Ctrl+Enter / Cmd+Enter keyboard shortcut
- [ ] 7.6 Disable execute button during execution

## 9. Script Editor Panel - Loading & Cancellation
- [ ] 8.1 Show indeterminate progress indicator during execution
- [ ] 8.2 Display cancel button during execution
- [ ] 8.3 Implement query cancellation (abort connection query)
- [ ] 8.4 Handle Escape key to cancel query
- [ ] 8.5 Re-enable execute button and hide cancel on completion
- [ ] 8.6 Display cancellation message in results area

## 10. Script Editor Panel - Results Display
- [ ] 9.1 Render results in table format with fixed header row
- [ ] 9.2 Implement virtualized table rendering for large result sets
- [ ] 9.3 Display null values distinctly (italic "NULL")
- [ ] 9.4 Show status bar: connection name, execution time, row count
- [ ] 9.5 Limit results to 1000 rows with truncation warning
- [ ] 9.6 Handle empty result sets gracefully
- [ ] 9.7 Show affected rows count for INSERT/UPDATE/DELETE

## 11. Transaction Mode Management
- [ ] 10.1 Implement query type detection (SELECT vs INSERT/UPDATE/DELETE vs DDL)
- [ ] 10.2 Add transaction mode state (Auto/Manual/Smart) per script panel
- [ ] 10.3 Implement Smart Commit: auto for SELECT, manual for data modifications
- [ ] 10.4 Add transaction mode dropdown/toggle in script editor UI
- [ ] 10.5 Display pending changes counter when in manual mode
- [ ] 10.6 Implement Commit button functionality
- [ ] 10.7 Implement Rollback button functionality
- [ ] 10.8 Handle DDL auto-commit semantics (warn about pending transaction commit)

## 12. Destructive Operation Safety
- [ ] 11.1 Detect DELETE without WHERE clause and show warning dialog
- [ ] 11.2 Detect DROP statements and require type-to-confirm dialog
- [ ] 11.3 Detect TRUNCATE and show non-reversible warning
- [ ] 11.4 Warn when DDL will auto-commit pending changes
- [ ] 11.5 Ensure Cancel/dismiss never executes the operation
- [ ] 11.6 Style destructive dialogs distinctly (warning colors)

## 13. Script Editor Panel - Accessibility
- [ ] 12.1 Implement logical tab order (dropdown → textarea → execute)
- [ ] 12.2 Add ARIA labels to interactive elements
- [ ] 12.3 Ensure focus indicators are visible
- [ ] 12.4 Test keyboard-only navigation flow

## 14. Commands and Registration
- [ ] 13.1 Register `dbooly.openScriptEditor` command
- [ ] 13.2 Add command to command palette via `package.json`
- [ ] 13.3 Add "New Query Script" button to tree view header
- [ ] 13.4 Register all panel disposables in extension context
- [ ] 13.5 Clean up all open panels on extension deactivation

## 15. Validation and Testing
- [ ] 14.1 Test activation flow with multiple connections
- [ ] 14.2 Verify grayed-out styling across light/dark themes
- [ ] 14.3 Test multiple script panels open simultaneously
- [ ] 14.4 Test each panel targets correct connection independently
- [ ] 14.5 Test query execution with SELECT, INSERT, UPDATE, DELETE
- [ ] 14.6 Test cancellation of long-running queries
- [ ] 14.7 Test dropdown behavior when connections change
- [ ] 14.8 Verify panel disposal and cleanup
- [ ] 14.9 Test keyboard accessibility (tab order, shortcuts)
- [ ] 14.10 Test split pane resizing
- [ ] 14.11 Test transaction modes (Auto/Manual/Smart)
- [ ] 14.12 Test Commit and Rollback functionality
- [ ] 14.13 Test destructive operation warnings (DELETE, DROP, TRUNCATE)
- [ ] 14.14 Verify DDL auto-commit warnings work correctly
