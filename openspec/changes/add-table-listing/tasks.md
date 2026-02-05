## 1. Database Schema Provider

- [x] 1.1 Create `SchemaProvider` interface with `listTables(connection): Promise<TableInfo[]>` method
- [x] 1.2 Implement `MySQLSchemaProvider` using `SHOW FULL TABLES` to get table types
- [x] 1.3 Create provider factory to return correct provider based on `DatabaseType`

## 2. Tree View Enhancement

- [x] 2.1 Update `ConnectionTreeItem` to use `TreeItemCollapsibleState.Collapsed` instead of `None`
- [x] 2.2 Create `TableTreeItem` class extending `vscode.TreeItem` with table icon and type description
- [x] 2.3 Update `ConnectionTreeProvider.getChildren()` to:
  - Return connections when `element` is undefined
  - Return tables when `element` is a `ConnectionTreeItem`
- [x] 2.4 Cache fetched tables per connection to avoid re-querying on collapse/expand

## 3. Connection Pool Management

- [x] 3.1 Create `ConnectionPool` class to manage active database connections
- [x] 3.2 Implement `getConnection(config)` that reuses existing connections or creates new ones
- [x] 3.3 Add `dispose()` method to close all connections
- [x] 3.4 Register pool disposal in `context.subscriptions` for cleanup on deactivation
- [x] 3.5 Add connection timeout/keepalive handling

## 4. Error Handling

- [x] 4.1 Wrap table fetch in try/catch with user-friendly error messages via `vscode.window.showErrorMessage`
- [x] 4.2 Handle connection timeout gracefully
- [x] 4.3 Allow retry by collapsing and re-expanding the connection

## 5. Table Search UI

- [x] 5.1 Create `TableSearchPanel` webview with search input and results list
- [x] 5.2 Add search button as inline action on connection rows in `package.json`
- [x] 5.3 Register `dbooly.searchTables` command with connection parameter
- [x] 5.4 Load tables from the selected connection on panel open
- [x] 5.5 Implement keyboard navigation (arrows, Enter, Escape)

## 6. Package.json Updates

- [x] 6.1 Add `searchTables` command with search icon
- [x] 6.2 Add search button to `view/item/context` menu with inline group

## 7. Manual Testing

- [ ] 7.1 Test table listing with MySQL connection
- [ ] 7.2 Test expansion/collapse caching behavior
- [ ] 7.3 Test native filter with partial table names
- [ ] 7.4 Test search panel for a single connection
- [ ] 7.5 Test error handling with invalid credentials
