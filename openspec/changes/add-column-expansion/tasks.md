## 1. Data Model
- [x] 1.1 Create `src/models/column.ts` with `ColumnInfo` interface (name, dataType, nullable, keyType, defaultValue, foreignKeyRef, tableName, connectionId)

## 2. Schema Provider Interface
- [x] 2.1 Add `listColumns(pool, config, tableName): Promise<ColumnInfo[]>` method to `SchemaProvider` interface
- [x] 2.2 Implement `listColumns` in `MySQLSchemaProvider` using optimized single query with JOIN to `key_column_usage`

## 3. Tree Provider Updates
- [x] 3.1 Create `ColumnTreeItem` class extending `vscode.TreeItem` with appropriate icons and tooltip
- [x] 3.2 Create `LoadingTreeItem` class with spinner icon (`loading~spin`)
- [x] 3.3 Create `ErrorTreeItem` class with error icon
- [x] 3.4 Create `EmptyTreeItem` class for "No columns" placeholder
- [x] 3.5 Change `TableTreeItem` collapsible state from `None` to `Collapsed`
- [x] 3.6 Add LRU column cache with max=100 entries and TTL=10 minutes
- [x] 3.7 Update `getChildren()` to return columns when parent is a `TableTreeItem`
- [x] 3.8 Add `getColumnsForTable()` method with loading state, caching, and error handling
- [x] 3.9 Update `TreeItem` type union to include new tree item types
- [x] 3.10 Update `refresh()` and `refreshConnection()` to clear column cache

## 4. Selection Behavior (BREAKING)
- [x] 4.1 Remove `treeView.onDidChangeSelection` handler that auto-opens data panel
- [x] 4.2 Ensure "View Data" context menu action still works
- [x] 4.3 ~~Add keyboard handler: Enter key on table opens data panel~~ (Skipped - VSCode tree views don't support custom Enter key handlers; context menu is sufficient)

## 5. Icon Selection
- [x] 5.1 Use `symbol-field` for regular columns
- [x] 5.2 Use `key` for primary key columns
- [x] 5.3 Use `references` for foreign key columns
- [x] 5.4 Use `loading~spin` for loading state
- [x] 5.5 Use `error` for error state
- [x] 5.6 Use `info` for empty state

## 6. Testing
- [ ] 6.1 Manual test: Expand a table and verify loading spinner appears
- [ ] 6.2 Manual test: Verify columns appear after loading completes
- [ ] 6.3 Manual test: Verify column icons differ for PK/FK columns
- [ ] 6.4 Manual test: Verify tooltip shows full column metadata
- [ ] 6.5 Manual test: Verify column cache works (no spinner on re-expansion)
- [ ] 6.6 Manual test: Verify connection refresh clears column cache
- [ ] 6.7 Manual test: Verify single-click on table row expands (no data panel)
- [ ] 6.8 Manual test: Verify "View Data" context menu opens data panel
- [ ] 6.9 Manual test: Verify error state appears on fetch failure
- [ ] 6.10 Manual test: Verify "No columns" placeholder for empty tables
