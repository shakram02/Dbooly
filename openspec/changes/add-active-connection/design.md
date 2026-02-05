## Context
dbooly currently supports multiple database connections but has no concept of an "active" connection for query execution. The table data panels are tied to specific connections via `TableInfo.connectionId`, but there's no way to run arbitrary SQL against a connection without going through the table view.

Users need to write global query scripts that target whichever database they're currently working with, with the flexibility to switch databases via a dropdown without closing the script.

## Goals / Non-Goals

### Goals
- Single active connection state at workspace level
- Visual distinction between active and inactive connections in tree view
- Global script editor that executes against active connection
- Connection dropdown in script editor for overriding target database
- Automatic activation when connecting to a database
- Loading/progress feedback during query execution
- Query cancellation support for long-running queries
- Keyboard accessibility for all interactions

### Non-Goals
- Multiple simultaneous active connections (one active at a time)
- Script persistence/saving (future enhancement)
- Query history (future enhancement)
- Auto-complete/intellisense for SQL (future enhancement)

## Architectural Patterns

This change follows the existing codebase patterns and introduces new abstractions where needed:

### Pattern 1: Event-Driven State Changes
Following VSCode's `EventEmitter` pattern (used in `TreeDataProvider`), `ConnectionManager` will emit events when active connection changes. This allows loose coupling - the tree view, script editors, and any future components can subscribe independently.

### Pattern 2: Provider Interface Extension
Extend the existing `SchemaProvider` pattern to support raw SQL execution. Add `executeQuery()` method to handle arbitrary SQL with transaction awareness.

### Pattern 3: Separation of Concerns
- **Models** (`models/`) - Data structures only, no logic
- **Providers** (`providers/`) - Database-specific implementations (SQL execution)
- **Views** (`views/`) - Webview panels (UI rendering, message handling)
- **Connections** (`connections/`) - Connection state, pooling, commands

### Pattern 4: Dependency Injection
All components receive dependencies via constructor, matching existing `ConnectionManager(storage)` pattern. Script editor receives `ConnectionManager` and `ConnectionPool` references.

### Pattern 5: Message-Based Webview Communication
Following existing `TableDataPanel` pattern: webview sends commands via `postMessage`, extension host processes and responds. No direct DOM manipulation from extension host.

## Decisions

### Decision 1: Active Connection State Location
**Decision**: Store active connection ID in `ConnectionManager` with getter/setter and EventEmitter.

**Implementation sketch**:
```typescript
// In ConnectionManager - follows VSCode EventEmitter pattern
private _activeConnectionId: ConnectionId | null = null;
private _onDidChangeActiveConnection = new vscode.EventEmitter<ConnectionId | null>();
readonly onDidChangeActiveConnection = this._onDidChangeActiveConnection.event;

setActiveConnection(id: ConnectionId | null): void {
    if (this._activeConnectionId !== id) {
        this._activeConnectionId = id;
        this._onDidChangeActiveConnection.fire(id);
    }
}

getActiveConnectionId(): ConnectionId | null {
    return this._activeConnectionId;
}
```

**Alternatives considered**:
- Separate `ActiveConnectionService` - Overkill for single state value
- VSCode workspace state - Overly complex for runtime-only state
- Per-webview state - Doesn't support global coordination

**Rationale**: `ConnectionManager` already owns connection state. Adding EventEmitter follows VSCode patterns and enables loose coupling between tree view and script editors.

### Decision 2: Tree View Visual Distinction
**Decision**: Use VSCode `ThemeColor` with reduced opacity for inactive connection labels.

**Implementation**:
- Active connections: normal text color
- Inactive connections: `foreground` with `listDeemphasizedForeground` theme color
- Connection icon badge or suffix indicator for active state

**Alternatives considered**:
- Custom icons for active/inactive - Would require duplicate icon sets
- Description field showing "(inactive)" - Clutters the UI
- Strikethrough text - Implies deletion, wrong semantics

### Decision 3: Script Editor Panel Architecture
**Decision**: Create a new webview panel `ScriptEditorPanel` that supports multiple independent instances (not singleton). Follow existing `TableDataPanel` patterns for message handling.

**Class structure** (following existing patterns):
```typescript
// views/script-editor-panel.ts
export class ScriptEditorPanel {
    // NO static currentPanel - allows multiple instances
    private static panels: Set<ScriptEditorPanel> = new Set();

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private selectedConnectionId: ConnectionId | null;
    private transactionMode: 'auto' | 'manual' | 'smart' = 'smart';
    private pendingStatements: number = 0;

    constructor(
        panel: vscode.WebviewPanel,
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool,
    ) {
        ScriptEditorPanel.panels.add(this);
        // Setup message handlers, subscribe to connection events
    }

    static create(
        connectionManager: ConnectionManager,
        connectionPool: ConnectionPool,
    ): ScriptEditorPanel {
        const panel = vscode.window.createWebviewPanel(...);
        return new ScriptEditorPanel(panel, connectionManager, connectionPool);
    }

    static disposeAll(): void {
        for (const panel of ScriptEditorPanel.panels) {
            panel.dispose();
        }
    }
}
```

**Components per script panel**:
- Connection dropdown selector at top (populated from `ConnectionManager`)
- Transaction mode indicator (Auto/Manual/Smart)
- SQL text area with monospace font (top half of panel)
- Execute button with loading state
- Cancel button (appears during execution)
- Commit/Rollback buttons (when pending changes exist)
- Results area (bottom half, shown after execution via split pane)
- Status bar showing execution time, row count, connection name

**Layout behavior**:
- Initial state: SQL textarea fills the panel
- After execution: Panel splits vertically - SQL on top, results on bottom
- Each script panel has its own independent results pane
- Multiple script panels can be open simultaneously

**Alternatives considered**:
- Singleton panel - User explicitly requested multiple scripts
- Reuse VSCode native editor with custom language - Too complex for MVP
- Integrate into TableDataPanel - Muddies concerns, different use case
- Separate results window - Disrupts workflow, harder to correlate query with results

### Decision 4: Connection Activation Trigger
**Decision**: Automatically activate on successful connection establishment (expanding connection node in tree).

**Behavior**:
- When a connection node is expanded, it becomes active if expansion succeeds
- Manually activating via context menu or command is also supported
- Creating a new connection does not auto-activate until first use

**Alternatives considered**:
- Manual activation only - Extra step for common case
- Activate on creation - May activate untested/broken connections

### Decision 5: Script-Connection Binding
**Decision**: Script editor stores a `selectedConnectionId` that defaults to active connection but can be overridden via dropdown.

**Behavior flow**:
1. Open script editor → dropdown shows active connection selected
2. Change dropdown → script uses that connection for execution
3. Active connection changes → dropdown does NOT auto-switch (preserves user choice)
4. If selected connection is deleted → dropdown resets to active or first available

### Decision 6: Query Execution Architecture
**Decision**: Extend `SchemaProvider` interface with `executeQuery()` method for raw SQL execution.

**Interface extension**:
```typescript
// In providers/schema-provider.ts
export interface SchemaProvider {
    // Existing methods...
    listTables(...): Promise<TableInfo[]>;
    listColumns(...): Promise<ColumnInfo[]>;
    queryTableData(...): Promise<QueryResult>;

    // New method for raw SQL execution
    executeQuery(
        pool: ConnectionPool,
        config: ConnectionConfigWithPassword,
        sql: string,
        options?: QueryExecutionOptions
    ): Promise<QueryExecutionResult>;
}

export interface QueryExecutionOptions {
    limit?: number;           // Default 1000
    timeout?: number;         // Default 30000ms
    transactionMode?: 'auto' | 'manual';
}

export interface QueryExecutionResult {
    type: 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'other';
    columns?: string[];       // For SELECT
    rows?: unknown[][];       // For SELECT
    affectedRows?: number;    // For INSERT/UPDATE/DELETE
    executionTimeMs: number;
    truncated?: boolean;      // True if results limited
    totalRowCount?: number;   // If available from DB
}
```

**Rationale**: Extending existing `SchemaProvider` keeps database-specific logic centralized. MySQL, PostgreSQL, SQLite can each implement their own query execution with proper escaping and transaction handling.

### Decision 7: Query Cancellation Architecture
**Decision**: Use database-level cancellation where supported, with AbortController for timeout.

**Implementation approach**:
```typescript
// Query execution with cancellation support
async executeQuery(sql: string, signal?: AbortSignal): Promise<QueryExecutionResult> {
    const connection = await this.pool.getConnection(config);

    // Store query reference for cancellation
    const queryPromise = connection.query(sql);

    if (signal) {
        signal.addEventListener('abort', () => {
            // MySQL: connection.destroy() or KILL QUERY
            // PostgreSQL: pg_cancel_backend()
            connection.destroy();
        });
    }

    return queryPromise;
}
```

**Rationale**: Database-level cancellation is more reliable than just ignoring results. AbortController is the standard pattern for cancellable async operations.

### Decision 8: Transaction Mode Strategy
**Decision**: Implement "Smart Commit" as default, with Auto and Manual modes available.

**Smart Commit behavior** (following DBeaver's proven pattern):
- SELECT queries execute without transaction overhead
- INSERT/UPDATE/DELETE automatically switch to manual commit mode
- DDL statements (CREATE, DROP, ALTER) execute with auto-commit (database requirement)
- Pending transaction indicator shows uncommitted changes count
- Commit/Rollback buttons enabled when changes pending

**Alternatives considered**:
- Always auto-commit - Dangerous for production, no rollback protection
- Always manual commit - Unnecessary overhead for read-only queries
- Per-query transactions - Too granular, doesn't support multi-statement workflows

**Rationale**: Smart commit provides safety for data modifications while keeping read-only queries efficient. This matches DataGrip and DBeaver patterns.

### Decision 9: Destructive Operation Safeguards
**Decision**: Implement tiered confirmation for destructive operations.

**Tier 1 - Warning dialog** (DELETE without WHERE, TRUNCATE):
- Show warning with operation type and affected object
- Require explicit "Confirm" click (not just Enter key)
- Cancel if dialog dismissed without confirmation

**Tier 2 - Type-to-confirm** (DROP statements):
- Require user to type the object name exactly
- Prevents accidental deletion via muscle memory
- Matches IntelliJ/DataGrip pattern

**Tier 3 - DDL transaction warning**:
- Warn that DDL commits pending transactions automatically
- Give user chance to rollback pending changes first

**Rationale**: Irreversible operations (DROP, TRUNCATE) need stronger protection than reversible ones (DELETE). Type-to-confirm prevents "click OK on reflex" accidents.

## Risks / Trade-offs

### Risk: User confusion about which connection is targeted
**Mitigation**:
- Clear visual indicator of active connection in tree (green dot badge)
- Script editor always shows current target in dropdown prominently
- Status bar in each script panel shows connected database name
- Consider global VSCode status bar indicator showing active connection

### Risk: Accidentally running query against wrong database
**Mitigation**:
- Dropdown clearly visible at top of each script editor
- Connection name displayed in status bar of results pane
- Consider confirmation for destructive queries (DELETE, DROP, TRUNCATE)

### Risk: Long-running queries blocking UI
**Mitigation**:
- Show indeterminate progress indicator during execution
- Provide Cancel button to abort long-running queries
- Disable Execute button during execution to prevent duplicate submissions
- Query execution runs asynchronously, does not block webview

### Risk: Large result sets causing performance issues
**Mitigation**:
- Limit results to 1000 rows by default
- Use virtualized table rendering for results (render only visible rows)
- Show truncation warning with actual row count when limited

### Trade-off: Single active connection limitation
**Accepted**: Users wanting to compare two databases must switch between them or open multiple workspace windows. This simplifies the mental model and avoids complex multi-selection UX.

### Trade-off: Multiple script panels instead of tabbed interface
**Accepted**: Using VSCode's native panel management (side-by-side, tabs) rather than building custom tab UI inside a single panel. Leverages VSCode's existing UX patterns.

## Migration Plan
No migration needed - this is additive functionality. Existing connections default to inactive state until explicitly activated.

## Open Questions
1. ~~Should the script editor support multiple tabs/scripts?~~ **Resolved: Yes - multiple independent panels**
2. Should query results be exportable? (Yes - reuse existing export patterns)
3. Should there be a keyboard shortcut to execute query? (Yes - Ctrl+Enter / Cmd+Enter)
4. Should the split pane ratio be adjustable? (Yes - draggable divider)
5. Should there be syntax highlighting for SQL? (Deferred - basic monospace for MVP)
