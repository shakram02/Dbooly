# Tasks: Add Column Sorting

## Overview
Implementation tasks for adding interactive column sorting to the table data panel.

## Prerequisites
- Existing `TableDataPanel` webview with column headers
- Existing `SchemaProvider.queryTableData()` method
- Message passing between extension and webview

---

## Tasks

### 1. Define sort types and interfaces
**Files**: `src/providers/schema-provider.ts`

- [x] Add `SortDirection` type: `'ASC' | 'DESC' | null`
- [x] Add `SortOptions` interface: `{ column: string; direction: SortDirection }`
- [x] Update `SchemaProvider.queryTableData()` signature to accept optional `sort?: SortOptions`

**Validation**: TypeScript compiles without errors

---

### 2. Implement MySQL ORDER BY generation
**Files**: `src/providers/mysql-schema-provider.ts`

- [x] Update `queryTableData()` to accept sort parameter
- [x] Generate ORDER BY clause when sort is provided
- [x] Escape column name using backtick escaping (same as table name)
- [x] Validate sort direction is 'ASC' or 'DESC' only

**Validation**:
```sql
-- With sort: { column: 'name', direction: 'ASC' }
SELECT * FROM `users` ORDER BY `name` ASC LIMIT 100

-- With sort: { column: 'created_at', direction: 'DESC' }
SELECT * FROM `users` ORDER BY `created_at` DESC LIMIT 100

-- Without sort:
SELECT * FROM `users` LIMIT 100
```

---

### 3. Add sort state to TableDataPanel
**Files**: `src/views/table-data-panel.ts`

- [x] Add private properties: `sortColumn: string | null`, `sortDirection: SortDirection`
- [x] Update `getData` callback type to accept sort options
- [x] Add message handler for 'sort' command from webview
- [x] Update `loadData()` to pass sort options to getData callback
- [x] Include sort state in 'data' message to webview

**Validation**: Extension host correctly stores and passes sort state

---

### 4. Update connection-tree-provider callback
**Files**: `src/connections/connection-tree-provider.ts`

- [x] Update `TableDataPanel.show()` callback to accept sort parameter
- [x] Pass sort options to `provider.queryTableData()`

**Validation**: Sort options flow from panel to provider

---

### 5. Add sort click handlers to webview
**Files**: `src/views/table-data-panel.ts` (webview script section)

- [x] Add `currentSortColumn` and `currentSortDirection` state variables
- [x] Add `handleColumnClick(columnName)` function implementing cycle logic
- [x] Attach click handlers to column headers (not resize handles)
- [x] Send 'sort' message to extension: `vscode.postMessage({ command: 'sort', column, direction })`
- [x] Ensure resize handle clicks call `stopPropagation()` (already implemented in existing code)

**Validation**: Clicking column header logs sort intent; clicking resize handle does not

---

### 6. Add sort indicator to column headers
**Files**: `src/views/table-data-panel.ts` (webview HTML/CSS/JS)

- [x] Update `renderTable()` to accept sort state
- [x] Modify column header rendering to include sort indicator span
- [x] Add indicator text: ▲ for ASC, ▼ for DESC, empty for unsorted
- [x] Add CSS styling for `.sort-indicator`

**Validation**: Visual indicator appears next to sorted column name

---

### 7. Style column headers for clickability
**Files**: `src/views/table-data-panel.ts` (webview CSS)

- [x] Add `cursor: pointer` to `th` elements
- [x] Add hover state using VSCode theme variable
- [x] Ensure sort indicator styling integrates with theme

**Validation**: Headers visually indicate they're clickable

---

### 8. Handle sort state in data messages
**Files**: `src/views/table-data-panel.ts` (extension + webview)

- [x] Include `sort: { column, direction }` in 'data' message from extension
- [x] Update webview message handler to sync local sort state from message
- [x] Re-render table with correct sort indicator after data load

**Validation**: Sort indicator correctly reflects server-side sort after data loads

---

### 9. Preserve sort with search filter
**Files**: `src/views/table-data-panel.ts` (webview JS)

- [x] Ensure `renderFilteredTable()` uses current sort state for indicators
- [x] Verify search filtering doesn't clear sort state
- [x] Verify sort change preserves search term

**Validation**: Sort + filter work together correctly

---

### 10. Manual testing
**No files** (manual verification)

- [ ] Test sort ascending on text column
- [ ] Test sort descending on numeric column
- [ ] Test sort on column with NULL values
- [ ] Test sort clear (third click)
- [ ] Test switching sort columns
- [ ] Test sort + search filter combination
- [ ] Test column resize doesn't trigger sort
- [ ] Test sort indicator visibility with narrow columns

**Validation**: All scenarios work as specified

---

## Dependency Graph

```
[1] Types/Interfaces
         │
         ▼
[2] MySQL Provider ◄─────────┐
         │                   │
         ▼                   │
[3] TableDataPanel State     │
         │                   │
         ▼                   │
[4] Tree Provider Callback ──┘
         │
         ▼
[5] Webview Click Handlers
         │
         ▼
[6] Sort Indicator Rendering
         │
         ▼
[7] CSS Styling
         │
         ▼
[8] Message State Sync
         │
         ▼
[9] Filter Integration
         │
         ▼
[10] Manual Testing
```

## Parallelizable Work
- Tasks 5, 6, 7 can be worked on in parallel after task 3 is complete
- Tasks 1, 2, 3, 4 must be sequential (interface → implementation → usage)
