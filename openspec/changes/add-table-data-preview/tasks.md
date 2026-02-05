## 1. Schema Provider Extension
- [x] 1.1 Add `queryTableData(pool, config, tableName): Promise<QueryResult>` to SchemaProvider interface
- [x] 1.2 Define `QueryResult` type with columns and rows
- [x] 1.3 Implement `queryTableData()` in MySQLSchemaProvider with proper identifier escaping

## 2. Table Data Panel
- [x] 2.1 Create `src/views/table-data-panel.ts` webview panel class
- [x] 2.2 Implement HTML template with styled data table
- [x] 2.3 Add loading state while query executes
- [x] 2.4 Add error state for query failures
- [x] 2.5 Handle column headers from query metadata
- [x] 2.6 Implement horizontal scroll for wide tables
- [x] 2.7 Add resizable columns with drag handles
- [x] 2.8 Add local search/filter with match highlighting

## 3. Tree View Integration
- [x] 3.1 Add `dbooly.viewTableData` command in package.json
- [x] 3.2 Add context menu item for table items (`viewItem == table`)
- [x] 3.3 Register command handler in connection-tree-provider.ts
- [x] 3.4 Wire up table double-click to open data panel
- [x] 3.5 Pass connection config and table info to panel

## 4. Validation
- [x] 4.1 Test with MySQL database containing various data types
- [x] 4.2 Verify loading and error states display correctly
- [x] 4.3 Confirm panel title shows table name
- [x] 4.4 Build extension and verify no TypeScript errors

## Learnings

### Webview JavaScript Silent Failures
When webview scripts fail to execute entirely (no console output at all), check for **Node.js-specific APIs** that don't exist in browser environments:
- `Buffer.isBuffer()` - Use `ArrayBuffer.isView()` or check for `{type: 'Buffer', data: [...]}` instead
- `process`, `require`, `__dirname` - Not available in webviews
- These cause `ReferenceError` on script load, preventing all code from running

### CSS for Resizable Table Columns
For `table-layout: fixed` to respect explicit column widths:
```css
table {
    table-layout: fixed;
    width: max-content;   /* Table width = sum of column widths */
    min-width: 100%;      /* But at least fill the container */
}
```
Without `width: max-content`, the browser may auto-adjust column widths when the table spans the full container width.

### Double-Click Detection in VSCode Tree Views
VSCode tree views don't have native double-click events. Implement manually:
```typescript
let lastClickedItem = null;
let lastClickTime = 0;
const DOUBLE_CLICK_MS = 300;

treeView.onDidChangeSelection(event => {
    const selected = event.selection[0];
    const now = Date.now();
    const isDoubleClick = lastClickedItem?.id === selected?.id
        && (now - lastClickTime) < DOUBLE_CLICK_MS;

    if (isDoubleClick) {
        // Handle double-click
    }
    lastClickedItem = selected;
    lastClickTime = now;
});
```
