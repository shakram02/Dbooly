## Context
This change builds on the `add-active-connection` proposal which implemented:
- Active connection state management in `ConnectionManager`
- Tree view visual updates for active/inactive connections
- `SchemaProvider.executeQuery()` with cancellation support

The Script Editor Panel is a webview-based UI that allows users to write and execute SQL queries against any configured connection.

## Goals / Non-Goals

### Goals
- Multi-instance webview panels (users can open multiple script editors)
- Split pane layout with draggable divider
- Connection dropdown defaulting to active connection
- Query execution with loading, cancellation, and error handling
- Virtualized results table for performance
- Transaction mode support (Auto/Manual/Smart)
- Destructive operation warnings for DELETE/DROP/TRUNCATE
- Full keyboard accessibility

### Non-Goals
- SQL syntax highlighting (deferred - basic monospace for MVP)
- Query history (future enhancement)
- Script persistence/saving (future enhancement)
- Auto-complete/intellisense (future enhancement)

## Decisions

### Decision 1: Multi-Instance Panel Architecture
**Decision**: Use a static `Set<ScriptEditorPanel>` to track all open panels, not a singleton.

```typescript
export class ScriptEditorPanel {
    private static panels: Set<ScriptEditorPanel> = new Set();

    static create(extensionUri: vscode.Uri, connectionManager: ConnectionManager, connectionPool: ConnectionPool): ScriptEditorPanel {
        const panel = vscode.window.createWebviewPanel(
            'dbooly.scriptEditor',
            'New Query',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        return new ScriptEditorPanel(panel, extensionUri, connectionManager, connectionPool);
    }

    static disposeAll(): void {
        for (const panel of ScriptEditorPanel.panels) {
            panel.dispose();
        }
    }
}
```

**Rationale**: Users explicitly requested multiple independent script panels. Each panel maintains its own connection selection and results.

### Decision 2: Split Pane Implementation
**Decision**: Pure CSS/HTML split pane with JavaScript resize handling.

**Layout structure**:
```html
<div class="split-container">
    <div class="sql-pane">
        <textarea id="sql-editor"></textarea>
    </div>
    <div class="divider" id="divider"></div>
    <div class="results-pane" id="results-pane" style="display: none;">
        <!-- Results table rendered here -->
    </div>
</div>
```

**Behavior**:
- Initially: results pane hidden, SQL pane fills container
- After first execution: results pane appears, divider becomes draggable
- Minimum heights enforced: 100px SQL, 100px results
- Ratio persisted in panel state during session

**Rationale**: No external dependencies, follows existing `TableDataPanel` patterns.

### Decision 3: Message Protocol
**Decision**: Define explicit message types for webview communication.

```typescript
// Messages from webview to extension
type WebviewMessage =
    | { type: 'execute'; sql: string; connectionId: string }
    | { type: 'cancel' }
    | { type: 'changeConnection'; connectionId: string }
    | { type: 'commit' }
    | { type: 'rollback' }
    | { type: 'ready' };

// Messages from extension to webview
type ExtensionMessage =
    | { type: 'connections'; connections: ConnectionInfo[]; activeId: string | null }
    | { type: 'executing' }
    | { type: 'result'; result: QueryExecutionResult }
    | { type: 'error'; message: string }
    | { type: 'cancelled' }
    | { type: 'confirmDestructive'; operation: DestructiveOp };
```

**Rationale**: Type-safe message handling prevents runtime errors and documents the API.

### Decision 4: Virtualized Table Rendering
**Decision**: Implement row virtualization for result tables.

**Approach**:
- Only render visible rows plus small buffer (e.g., viewport + 20 rows)
- Calculate row positions based on fixed row height (24px)
- Update visible rows on scroll using `requestAnimationFrame`
- Use CSS `transform: translateY()` for smooth scrolling

**Why not full library**: Keep bundle size small, only need basic virtualization.

### Decision 5: Destructive Operation Detection
**Decision**: Parse SQL to detect destructive operations before execution.

```typescript
function analyzeDestructiveOp(sql: string): DestructiveOp | null {
    const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().toUpperCase();

    // DELETE without WHERE
    if (normalized.startsWith('DELETE') && !normalized.includes('WHERE')) {
        const tableMatch = normalized.match(/DELETE\s+FROM\s+[`"]?(\w+)[`"]?/i);
        return { type: 'delete-no-where', table: tableMatch?.[1] ?? 'unknown' };
    }

    // DROP statements
    if (normalized.startsWith('DROP')) {
        const match = normalized.match(/DROP\s+(TABLE|DATABASE|INDEX|VIEW)\s+[`"]?(\w+)[`"]?/i);
        return { type: 'drop', objectType: match?.[1], objectName: match?.[2] };
    }

    // TRUNCATE
    if (normalized.startsWith('TRUNCATE')) {
        const match = normalized.match(/TRUNCATE\s+(?:TABLE\s+)?[`"]?(\w+)[`"]?/i);
        return { type: 'truncate', table: match?.[1] ?? 'unknown' };
    }

    return null;
}
```

**Rationale**: Prevent accidental data loss. Regex parsing is sufficient for detection.

### Decision 6: Transaction Mode Toggle
**Decision**: Simple on/off toggle for transaction mode instead of three-mode dropdown.

```typescript
interface TransactionState {
    manualMode: boolean;  // false = auto-commit, true = manual transaction
    pendingStatements: number;
    hasUncommittedChanges: boolean;
}
```

**Toggle behavior**:
- OFF (default): Auto-commit - each query commits immediately
- ON: Manual transaction - changes held until explicit Commit/Rollback
- Toggle disabled when pending changes exist (must commit/rollback first)

**UI pattern**:
```html
<button class="toggle-btn" aria-pressed="false">
    <span class="toggle-indicator"></span>
    <span class="toggle-label">Auto-commit</span>
</button>

<!-- Warning banner shown when uncommitted changes exist -->
<div class="transaction-warning-banner" role="alert">
    <span class="warning-icon">⚠</span>
    <span>Uncommitted changes (3 pending)</span>
</div>
```

**Visual indicator for uncommitted changes**:
- Warning-colored banner (yellow/orange) displayed below toolbar when `hasUncommittedChanges` is true
- Shows pending count to reinforce awareness
- Uses `role="alert"` for screen reader announcement
- Persists until commit/rollback - cannot be dismissed manually

**Rationale**: Toggle is simpler UX than dropdown for binary choice. Users understand on/off metaphor intuitively. Disabling toggle when changes pending prevents accidental mode switch that could cause confusion about transaction state. The warning banner ensures users don't forget about pending changes, especially when switching tabs or after long editing sessions.

## Risks / Trade-offs

### Risk: Large result sets causing browser memory issues
**Mitigation**:
- Default limit of 1000 rows with truncation warning
- Virtualized rendering only loads visible rows into DOM
- Results cleared on new query execution

### Risk: User confusion about transaction state
**Mitigation**:
- Clear pending changes indicator in UI
- Commit/Rollback buttons only visible when changes pending
- Warning dialog before closing panel with uncommitted changes

### Trade-off: No SQL syntax highlighting in MVP
**Accepted**: Adding proper SQL highlighting requires tokenizer/grammar. Monospace font with proper spacing is sufficient for initial release. Can be added later with Monaco or CodeMirror.

### Trade-off: No query history
**Accepted**: Adds complexity (storage, UI). Users can re-type or paste queries. Future enhancement.

## Migration Plan
No migration needed - additive functionality. New command registered in package.json.

## Open Questions
1. Should we warn before closing panel with uncommitted changes? (Yes - add confirmation dialog)
2. Should results be exportable? (Yes - reuse existing export patterns, future task)
