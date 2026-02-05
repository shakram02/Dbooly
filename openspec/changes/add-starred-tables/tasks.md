## 1. Storage Layer
- [x] 1.1 Add starred tables storage to `ConnectionStorage` class (Map + Set pattern)
- [x] 1.2 Store starred tables in `.vscode/dbooly-connections.json` under a `starredTables` key (keyed by connectionId)

## 2. Tree View Integration
- [x] 2.1 Modify `TableTreeItem` to show star icon for starred tables
- [x] 2.2 Create `sortTablesStarredFirst()` utility function
- [x] 2.3 Update `getTablesForConnection()` to sort starred tables first
- [x] 2.4 Register `dbooly.starTable` and `dbooly.unstarTable` commands
- [x] 2.5 Add context menu items for star/unstar actions in `package.json`

## 3. Search Panel Integration
- [x] 3.1 Pass starred tables getter and toggle callback to `TableSearchPanel`
- [x] 3.2 Update search results rendering to show star indicator
- [x] 3.3 Add star toggle button next to each search result
- [x] 3.4 Handle `toggleStar` message from webview
- [x] 3.5 Sort filtered search results with starred first

## 4. Testing & Validation
- [ ] 4.1 Verify starring works from tree view context menu
- [ ] 4.2 Verify starring works from search panel
- [ ] 4.3 Verify starred tables persist across extension reload
- [ ] 4.4 Verify search filtering still works correctly with starred sorting
