# Project Context

## Purpose
dbooly is a VSCode extension that serves as a database viewer and query tool. It enables developers to connect to multiple databases simultaneously, inspect schemas, execute queries, and manage data directly from their IDE.

### Core Capabilities
- **Multi-database connections**: Connect to and manage multiple database instances concurrently
- **Schema inspection**: Browse tables, columns, indexes, and relationships
- **Query execution**: Write and run SQL queries with results display
- **Data management**: View, add, edit, and delete rows
- **Data export**: Export query results and table data to various formats

## Tech Stack
- **Extension**: TypeScript (VSCode Extension API)
- **UI**: Native VSCode webviews with pure TypeScript
- **Supported Databases**: PostgreSQL, MySQL, SQLite
- **Build**: VSCode extension bundling (esbuild/webpack)
- **Package Manager**: npm/pnpm

## Project Conventions

### Code Style
- TypeScript strict mode enabled
- ESLint for linting
- Prettier for formatting
- Prefer `async/await` over raw promises
- Use descriptive variable names; avoid abbreviations except for common ones (db, sql, etc.)

### Architecture Patterns
- **Extension Host / Webview separation**: Business logic in extension host, UI in webviews
- **Provider pattern**: Database-specific implementations behind common interfaces
- **Connection pooling**: Manage database connections efficiently
- **Message passing**: Communication between extension host and webviews via `postMessage`

### VSCode Extension Best Practices

#### Tree Views
- Use `TreeItemCollapsibleState.Collapsed` for lazy loading - `getChildren()` only called on expansion
- Use `createTreeView()` over `registerTreeDataProvider()` for programmatic control (reveal, selection)
- Implement `onDidChangeTreeData` event for refresh capability
- Set `contextValue` on TreeItems to enable context menu filtering
- Use native type-to-filter over custom search UI for consistency with VSCode UX
- Use `ThemeColor` for tree item styling (e.g., `listDeemphasizedForeground` for inactive items)
- Use icon badge overlays for status indicators (green dot for active, etc.)

#### Resource Management
- Register all disposables in `context.subscriptions` for cleanup on deactivation
- Connection pools must implement `dispose()` and be registered for cleanup
- No explicit activation events needed for views (VSCode 1.74+ auto-activates)

#### Notifications & Feedback
- Success states don't need notifications - the UI update IS the feedback
- Use `showErrorMessage()` with action buttons (e.g., "Retry") for errors
- Avoid repeated notifications - show once, let user retry via UI interaction
- Reserve modal dialogs for blocking input requirements only
- Use progress indicators in status bar or inline, not notification toasts

#### Commands
- Contribute commands in `package.json` for discoverability
- Use `view/title` menu for primary view actions (refresh, add)
- Use `view/item/context` for item-specific context menus
- Filter context menu visibility with `when` clauses and `contextValue`

### Webview Best Practices

#### Loading States & Feedback
- Use indeterminate progress indicators when duration is unknown
- Provide immediate visual response on user-triggered actions before showing loading state
- Show contextual feedback: what is loading, not just "loading..."
- Always provide a cancel option for long-running operations

#### Query Execution UX
- Disable submit/execute buttons during operation to prevent duplicate submissions
- Show cancel button during execution with clear consequences
- Display execution time and row count in status bar after completion
- Use distinct error styling (e.g., red text) for failures

#### Transaction Handling
- **Smart Commit (recommended default)**: Auto-commit for SELECT, manual for data modifications
- SELECT queries should NOT create transaction overhead (no locks)
- INSERT/UPDATE/DELETE should be held pending until explicit commit
- DDL statements (CREATE, DROP, ALTER) auto-commit - warn users about this
- Display pending changes counter when in manual commit mode
- Provide clear Commit/Rollback buttons when changes are pending

#### Destructive Operation Safety
- **DELETE without WHERE**: Show warning dialog before execution
- **DROP statements**: Require user to type object name to confirm (prevents muscle-memory accidents)
- **TRUNCATE**: Warn that operation cannot be rolled back
- **DDL with pending changes**: Warn that DDL will auto-commit pending transactions
- Never treat dialog dismissal as confirmation - always cancel on close
- Default focus to Cancel button, not Confirm

#### Performance Optimization
- Use virtualized table rendering for large result sets (render only visible rows)
- Limit result sets by default (e.g., 1000 rows) with truncation warning
- Cache data where appropriate to reduce re-fetching
- Minimize initial JavaScript payload in webviews
- Avoid memory leaks: clean up event listeners and object references

#### Split Pane Layouts
- Use draggable dividers for resizable panes
- Enforce minimum heights/widths to keep panes usable
- Persist pane ratios during session
- Initially hide secondary panes until needed (progressive disclosure)

### Accessibility Best Practices

#### Keyboard Navigation
- Implement logical tab order (top-to-bottom, left-to-right)
- Provide keyboard shortcuts for common actions (Ctrl+Enter for execute, Escape for cancel)
- Ensure all interactive elements are keyboard-accessible
- Show visible focus indicators

#### Screen Reader Support
- Add ARIA labels to all visual indicators (status badges, icons)
- Use semantic HTML structure (proper headings, lists, tables)
- Don't rely solely on color to convey information (use icons + color)

#### Visual Accessibility
- Use VSCode theme colors for consistent contrast ratios
- Test in both light and dark themes
- Ensure text remains readable when deemphasized (grayed out)

### Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)

### Testing Strategy
- Testing approach: To be determined
- Focus on critical paths: connection handling, query execution, data integrity

### Git Workflow
- Feature branches from `main`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- PRs require passing CI checks

## Domain Context

### Database Terminology
- **Connection**: A configured database instance with credentials
- **Schema**: The structure of a database (tables, columns, types, constraints)
- **Query**: A SQL statement executed against a database
- **Result set**: The rows returned from a SELECT query
- **Transaction**: A unit of work that can be committed or rolled back

### User Personas
- **Developer**: Primary user; needs quick access to database during development
- **DBA**: Occasional user; needs schema inspection and data export

### Key User Flows
1. **Connect**: Add connection → Test → Save to workspace
2. **Explore**: Browse databases → Select table → View schema/data
3. **Query**: Open query editor → Write SQL → Execute → View results
4. **Export**: Select data → Choose format → Export to file

## Important Constraints

### Technical Constraints
- Must work within VSCode extension sandbox
- Database drivers must be compatible with Node.js
- Webview security: CSP restrictions apply
- Extension size: Keep bundle size reasonable for marketplace

### Security Constraints
- Credentials stored securely (VSCode SecretStorage API)
- No credentials in plain text or logs
- Connection strings sanitized in error messages

#### SQL Query Safety (ABSOLUTE REQUIREMENT)
- **ALWAYS use parameterized queries** for user-provided values - never use string interpolation
- For values in WHERE clauses, use `?` placeholders: `WHERE column = ?` with `[value]` parameter array
- For identifiers (table/column names) that cannot be parameterized, use proper escaping:
  - MySQL: backtick escaping `` `name` `` with internal backticks doubled
  - PostgreSQL: double-quote escaping `"name"` with internal quotes doubled
- LIMIT values must be validated as integers before interpolation
- Never concatenate raw user input into SQL strings

### UX Constraints
- Responsive UI that doesn't block VSCode
- Large result sets must be paginated or virtualized
- Query execution should be cancellable
- Clear feedback for long-running operations

## External Dependencies

### Database Drivers
- PostgreSQL: `pg` or `postgres` package
- MySQL: `mysql2` package
- SQLite: `better-sqlite3` or `sql.js` package

### VSCode APIs
- `vscode.window.createWebviewPanel` - UI panels
- `vscode.window.createTreeView` - Sidebar tree views with programmatic control
- `vscode.TreeDataProvider` - Tree data source interface
- `vscode.SecretStorage` - Credential storage
- `vscode.workspace.fs` - File operations for export
- `vscode.window.showErrorMessage` - Error notifications with actions
- `vscode.window.withProgress` - Progress indication for long operations

### VSCode API Reference Links
- [Tree View Guide](https://code.visualstudio.com/api/extension-guides/tree-view)
- [UX Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Notification Best Practices](https://code.visualstudio.com/api/ux-guidelines/notifications)

### Export Formats
- CSV
- JSON
- SQL (INSERT statements)
