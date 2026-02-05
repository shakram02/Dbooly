## Context

This change adds table listing to the existing connection tree view. It requires:
- Fetching schema information from databases (new capability)
- Managing active database connections efficiently (new infrastructure)
- Extending the tree view to support hierarchical data (modification)

## Goals / Non-Goals

**Goals:**
- Display tables under expanded connections
- Support filtering tables by name
- Reuse database connections for efficiency
- Handle errors gracefully without blocking the UI

**Non-Goals:**
- Column/index inspection (future enhancement)
- Schema/namespace hierarchy (kept flat per user preference)
- Real-time schema change detection

## Decisions

### 1. Provider Pattern for Database-Specific Queries

**Decision:** Create a `SchemaProvider` interface with database-specific implementations.

```typescript
interface SchemaProvider {
  listTables(pool: ConnectionPool, config: ConnectionConfig): Promise<TableInfo[]>;
}
```

**Rationale:** Each database has different system tables and query syntax. The provider pattern isolates this complexity and makes adding new database types straightforward.

**Alternatives considered:**
- Single function with switch statement: Less maintainable as DB count grows
- ORM/query builder: Over-engineered for metadata queries

### 2. Connection Pooling Strategy

**Decision:** Implement a simple connection pool keyed by connection ID.

```typescript
class ConnectionPool {
  private connections: Map<ConnectionId, PooledConnection>;

  async getConnection(config: ConnectionConfigWithPassword): Promise<Connection>;
  async dispose(): Promise<void>;
}
```

**Rationale:**
- Avoids reconnecting for every tree expansion
- VSCode extensions should clean up resources on deactivation
- Simple Map-based pool is sufficient (no need for `generic-pool` library)

**VSCode best practice:** Register `pool.dispose()` in `context.subscriptions` to ensure cleanup.

### 3. Table Caching in Tree Provider

**Decision:** Cache fetched tables in memory, keyed by connection ID.

```typescript
private tableCache: Map<ConnectionId, TableInfo[]> = new Map();
```

**Rationale:**
- Avoids re-querying on collapse/expand cycles
- Cache invalidated on connection edit/delete
- Manual refresh command clears cache

**Trade-off:** Stale data if tables change externally. Acceptable for development tool use case.

### 4. Tree View Filtering

**Decision:** Use VSCode's built-in tree view filter (type-to-filter).

**Rationale:**
- No custom UI needed
- Consistent with other VSCode panels (Explorer, Outline)
- Automatically handles keyboard navigation

**VSCode best practice:** Set `treeView.showCollapseAll: true` and rely on native filter rather than custom search input.

### 5. Error Handling Strategy

**Decision:** Use `vscode.window.showErrorMessage()` for connection/fetch errors, not notifications for success.

**Rationale (per VSCode UX Guidelines):**
- Notifications should be "absolutely necessary" - don't spam users
- Success states don't need confirmation (tree population IS the feedback)
- Errors need actionable feedback with retry option
- Avoid modal dialogs unless blocking input is required

**Pattern:**
```typescript
try {
  const tables = await provider.listTables(config);
  return tables.map(t => new TableTreeItem(t));
} catch (error) {
  vscode.window.showErrorMessage(
    `Failed to list tables: ${error.message}`,
    'Retry'
  ).then(action => {
    if (action === 'Retry') treeProvider.refresh();
  });
  return [];
}
```

### 6. Activation Strategy

**Decision:** No explicit activation events needed for tree views (VSCode 1.74+).

**Rationale:** VSCode automatically activates extensions when their contributed views are opened. The existing `package.json` view contribution handles this.

### 7. TreeView Registration

**Decision:** Use `createTreeView()` instead of `registerTreeDataProvider()`.

**Rationale:** Already in use in codebase. Provides `TreeView` API for future programmatic control (reveal, selection).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Connection leak if extension crashes | Use `mysql2` pool's automatic cleanup; register disposal in subscriptions |
| Large table count (1000+) slows tree | VSCode tree views handle lazy rendering; no pagination needed initially |
| Stale cache after external DDL | Add refresh button in view title; clear cache on refresh |
| Repeated error notifications | Show error once; user can retry via collapse/expand |

## VSCode Best Practices Applied

| Guideline | Implementation |
|-----------|----------------|
| Lazy loading via `getChildren()` | Tables fetched only on expansion |
| `TreeItemCollapsibleState.Collapsed` | Enables expand arrow without pre-fetching |
| `onDidChangeTreeData` event | Refresh mechanism for cache invalidation |
| `contextValue` on TreeItems | Enables context menu filtering |
| Disposable cleanup | Pool registered in `context.subscriptions` |
| Native filter over custom UI | Use built-in type-to-filter |
| Error notifications with actions | Retry button on failure |

## File Structure

```
src/
├── providers/
│   ├── schema-provider.ts      # Interface + factory
│   └── mysql-schema-provider.ts
├── connections/
│   ├── connection-pool.ts      # New: connection pooling
│   └── connection-tree-provider.ts  # Modified: hierarchical
└── models/
    └── table.ts                # New: TableInfo type
```
