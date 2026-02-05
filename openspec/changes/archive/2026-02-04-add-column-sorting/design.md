# Design: Add Column Sorting

## Overview
This document outlines the architecture for adding interactive column sorting to the table data panel.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TableDataPanel                           │
│  ┌──────────────────────┐    ┌─────────────────────────────┐   │
│  │     Extension Host   │    │         Webview             │   │
│  │                      │    │                             │   │
│  │  - sortColumn: str   │◄──►│  - Column header clicks     │   │
│  │  - sortDirection: asc│    │  - Sort indicator (▲/▼)     │   │
│  │  - getData(sort)     │    │  - renderTable(cols, rows)  │   │
│  └──────────┬───────────┘    └─────────────────────────────┘   │
└─────────────┼───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SchemaProvider                             │
│  queryTableData(pool, config, table, limit, sortColumn, dir)    │
│                              │                                  │
│                              ▼                                  │
│        SELECT * FROM `table` ORDER BY `col` ASC LIMIT 100       │
└─────────────────────────────────────────────────────────────────┘
```

## Interface Changes

### QueryResult (unchanged)
```typescript
interface QueryResult {
    columns: string[];
    rows: unknown[][];
}
```

### SortDirection Type (new)
```typescript
type SortDirection = 'ASC' | 'DESC' | null;
```

### SortOptions Interface (new)
```typescript
interface SortOptions {
    column: string;
    direction: SortDirection;
}
```

### SchemaProvider.queryTableData (modified signature)
```typescript
// Current:
queryTableData(pool, config, tableName, limit?): Promise<QueryResult>

// Proposed:
queryTableData(pool, config, tableName, limit?, sort?): Promise<QueryResult>
```

The `sort` parameter is optional for backward compatibility.

## Message Protocol

### Webview → Extension Messages

**Sort Request**
```typescript
{
    command: 'sort',
    column: string,      // Column name to sort by
    direction: 'ASC' | 'DESC' | null  // null = clear sort
}
```

### Extension → Webview Messages (existing, unchanged)

**Data Response** (already exists)
```typescript
{
    command: 'data',
    columns: string[],
    rows: unknown[][],
    // NEW: include current sort state for UI sync
    sort?: {
        column: string,
        direction: 'ASC' | 'DESC'
    }
}
```

## SQL Generation

### MySQL ORDER BY Construction
```typescript
// In MySQLSchemaProvider.queryTableData()
let query = `SELECT * FROM ${escapedTableName}`;

if (sort?.column && sort?.direction) {
    // Validate column exists in result fields
    const escapedColumn = '`' + sort.column.replace(/`/g, '``') + '`';
    query += ` ORDER BY ${escapedColumn} ${sort.direction}`;
}

query += ` LIMIT ${safeLimit}`;
```

### Security: Column Validation
The column name must be validated against the actual columns returned by the query to prevent injection:
```typescript
// After executing query, validate column exists
const validColumns = fields.map(f => f.name);
if (sort?.column && !validColumns.includes(sort.column)) {
    throw new Error(`Invalid sort column: ${sort.column}`);
}
```

Note: For MySQL, column validation happens implicitly when the query executes - an invalid column name will result in a MySQL error "Unknown column". However, explicit validation provides better error messages.

## UI Design

### Column Header Layout
```
┌─────────────────────────────────┬─────────────────┐
│ name ▲                          │ email           │ ← Only sorted col shows indicator
├─────────────────────────────────┼─────────────────┤
```

### Sort Indicator Styling
```css
.sort-indicator {
    margin-left: 4px;
    font-size: 10px;
    opacity: 0.8;
}

th:hover .sort-indicator.inactive {
    opacity: 0.4;  /* Show hint on hover */
}
```

### Click Behavior State Machine
```
            click              click              click
[unsorted] ──────► [ASC ▲] ──────► [DESC ▼] ──────► [unsorted]
```

### Cursor Feedback
```css
th {
    cursor: pointer;
}

th:hover {
    background-color: var(--vscode-list-hoverBackground);
}
```

## State Management

### Extension Host State
```typescript
class TableDataPanel {
    private sortColumn: string | null = null;
    private sortDirection: SortDirection = null;

    // Called when webview sends sort message
    private async handleSort(column: string, direction: SortDirection) {
        this.sortColumn = column;
        this.sortDirection = direction;
        await this.loadData();  // Re-fetch with new sort
    }
}
```

### Webview State
```javascript
let currentSortColumn = null;
let currentSortDirection = null;

function handleColumnClick(columnName) {
    if (currentSortColumn === columnName) {
        // Cycle: ASC → DESC → null
        if (currentSortDirection === 'ASC') {
            currentSortDirection = 'DESC';
        } else if (currentSortDirection === 'DESC') {
            currentSortDirection = null;
            currentSortColumn = null;
        }
    } else {
        // New column: start with ASC
        currentSortColumn = columnName;
        currentSortDirection = 'ASC';
    }

    vscode.postMessage({
        command: 'sort',
        column: currentSortColumn,
        direction: currentSortDirection
    });
}
```

## Interaction with Existing Features

### Client-Side Search Filter
- Sort is server-side (ORDER BY in SQL)
- Filter is client-side (JavaScript filtering)
- They work independently: sort first, then filter
- When sort changes, data is re-fetched, filter is preserved

### Column Resizing
- Sort click handler is on the `<th>` element
- Resize handler is on `.resize-handle` child
- Resize uses `stopPropagation()` to prevent sort trigger
- No conflict expected

## Trade-offs Considered

### Server-side vs Client-side Sorting
**Chosen: Server-side (ORDER BY)**

Pros:
- Works correctly with any number of rows (even if we increase limit)
- Sorting is consistent with database collation rules
- Index utilization for performance

Cons:
- Requires round-trip to database on each sort change
- Slightly slower feedback than JavaScript sort

Rationale: Server-side sorting is the correct approach for a database tool. Users expect database-consistent sorting behavior.

### Multi-column Sort
**Chosen: Single-column only**

Keeping scope minimal. Multi-column can be added later by:
- Shift+click to add secondary sort
- Showing "1▲ 2▼" indicators for sort priority
- Maintaining array of sort columns in state

## Future Considerations

1. **Sort persistence**: Store last sort per table in workspace state
2. **Default sort**: Option to always sort by primary key
3. **Null ordering**: UI for NULLS FIRST/LAST preference
4. **Multi-column**: Shift+click for secondary sort
