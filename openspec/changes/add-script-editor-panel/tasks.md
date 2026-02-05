## 1. SQL Executor - Core
- [x] 1.1 Create `sql-executor.ts` with query execution logic
- [x] 1.2 Get SQL from active editor (selection or full document)
- [x] 1.3 Execute SQL against active connection
- [x] 1.4 Handle query cancellation with AbortController
- [x] 1.5 Detect destructive operations (DELETE without WHERE, DROP, TRUNCATE)
- [x] 1.6 Show confirmation dialogs for destructive operations

## 2. Query Results Panel
- [x] 2.1 Reuse `TableDataPanel` singleton for query results (removed separate query-results-panel.ts)
- [x] 2.2 Open panel beside editor (ViewColumn.Beside) with preserveFocus
- [x] 2.3 Show loading state with connection name
- [x] 2.4 Render results table with fixed header
- [x] 2.5 Display null values distinctly (italic "NULL")
- [x] 2.6 Show status bar: connection, time, row count
- [x] 2.7 Show truncation warning for 1000+ rows (muted styling)
- [x] 2.8 Handle empty result sets gracefully
- [x] 2.9 Show affected rows for INSERT/UPDATE/DELETE
- [x] 2.10 Show error messages with icon
- [x] 2.11 Show cancellation message
- [x] 2.12 Client-side sorting for query results mode

## 3. Commands and Keybindings
- [x] 3.1 Register `dbooly.executeSql` command
- [x] 3.2 Register `dbooly.cancelQuery` command
- [x] 3.3 Add Ctrl+Enter / Cmd+Enter keybinding for SQL files
- [x] 3.4 Add context menu item for SQL files
- [x] 3.5 Add commands to package.json
- [x] 3.6 Register `dbooly.executeSqlAtCursor` command for CodeLens

## 3b. CodeLens Integration
- [x] 3b.1 Create `SqlCodeLensProvider` to show Execute button above SQL statements
- [x] 3b.2 Parse SQL to find statement boundaries (semicolon-delimited)
- [x] 3b.3 Show active connection name on CodeLens (e.g., "▶ Execute on MyDB")
- [x] 3b.4 Show "(no connection)" when no active connection
- [x] 3b.5 Refresh CodeLens when active connection changes

## 4. Active Connection Integration
- [x] 4.1 Use active connection from ConnectionManager
- [x] 4.2 Show QuickPick to select connection if none is active
- [x] 4.3 Auto-set selected connection as active for future queries
- [x] 4.4 Show error in results panel if no connections configured
- [x] 4.5 Focus connections sidebar when no connections exist

## 5. Cleanup
- [x] 5.1 Remove old script-editor-panel.ts webview
- [x] 5.2 Update extension.ts imports and initialization
- [x] 5.3 Register results panel disposal on deactivation

## 6. Validation and Testing
- [ ] 6.1 Test Ctrl+Enter execution in .sql files
- [ ] 6.2 Test execution with selected text vs full document
- [ ] 6.3 Test query cancellation
- [ ] 6.4 Test destructive operation warnings
- [ ] 6.5 Test results display for SELECT queries
- [ ] 6.6 Test results display for INSERT/UPDATE/DELETE
- [ ] 6.7 Test error display
- [ ] 6.8 Test connection picker when no active connection
- [ ] 6.9 Test CodeLens shows correct connection name
- [ ] 6.10 Test CodeLens updates when active connection changes

## 7. Future Enhancements (Out of Scope)
- [ ] SQL syntax highlighting (requires TextMate grammar)
- [ ] SQL auto-completion (keywords, tables, columns)
