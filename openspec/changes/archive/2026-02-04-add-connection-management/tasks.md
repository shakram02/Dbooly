## 1. Data Models & Types
- [x] 1.1 Create `src/models/connection.ts` with `ConnectionConfig` interface (name, type, host, port, database, username)
- [x] 1.2 Define `ConnectionId` type (UUID-based identifier)

## 2. Storage Layer
- [x] 2.1 Create `src/connections/connection-storage.ts` with file-based persistence
- [x] 2.2 Implement `loadConnections()` to read from `.vscode/dbooly-connections.json`
- [x] 2.3 Implement `saveConnections()` to write connection metadata (excluding passwords)
- [x] 2.4 Implement credential helpers using VSCode SecretStorage API

## 3. Connection Manager
- [x] 3.1 Create `src/connections/connection-manager.ts` as the main service
- [x] 3.2 Implement `addConnection()` with name uniqueness validation
- [x] 3.3 Implement `updateConnection()` for editing existing connections
- [x] 3.4 Implement `deleteConnection()` with confirmation and cleanup
- [x] 3.5 Implement `getConnection()` and `getAllConnections()`

## 4. Connection Testing
- [x] 4.1 Create `src/connections/connection-tester.ts` for testing connections
- [x] 4.2 Implement MySQL connection test using `mysql2` driver

## 5. VSCode Commands & UI
- [x] 5.1 Implement `dbooly.addConnection` command with input prompts
- [x] 5.2 Implement `dbooly.editConnection` command with QuickPick selection
- [x] 5.3 Implement `dbooly.deleteConnection` command with confirmation dialog
- [x] 5.4 Implement `dbooly.listConnections` command with information display
- [x] 5.5 Register all commands in `extension.ts`

## 6. Tree View UI
- [x] 6.1 Create `src/connections/connection-tree-provider.ts` with TreeDataProvider
- [x] 6.2 Add welcome view for empty state with "Add Connection" link
- [x] 6.3 Add toolbar buttons (add, refresh) in tree view header
- [x] 6.4 Add context menu (right-click) with Edit and Delete options
- [x] 6.5 Wire up tree refresh on connection changes
- [x] 6.6 Update `package.json` with menus and viewsWelcome contributions

## 7. Testing & Validation
- [ ] 7.1 Manual test: create, edit, delete connections
- [ ] 7.2 Manual test: verify password is not in JSON file
- [ ] 7.3 Manual test: verify connections persist across extension reload
- [ ] 7.4 Manual test: verify tree view shows connections and updates on changes
- [ ] 7.5 Manual test: verify context menu and toolbar buttons work
