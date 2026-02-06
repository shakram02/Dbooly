# Design: Replace sqls with sql-language-server

## Context

dbooly uses `sqls` (Go binary) for SQL language features (completions, hover, diagnostics). The binary is downloaded per-platform and spawned as a child process. `sqls` is now archived and unmaintained, creating technical debt.

**Stakeholders**: Extension users, maintainers
**Constraints**: Must support MySQL, PostgreSQL, SQLite; must work in VSCode extension sandbox

## Goals / Non-Goals

### Goals
- Replace sqls with actively maintained sql-language-server
- Eliminate platform-specific binary management
- Maintain feature parity for completions, hover, diagnostics
- Support dynamic connection switching without restart

### Non-Goals
- Adding new SQL language features (scope creep)
- Supporting additional databases beyond MySQL/PostgreSQL/SQLite
- Changing the overall LSP architecture

## Decisions

### 1. Use sql-language-server npm package

**Decision**: Install `sql-language-server` as an npm dependency and spawn it via Node.

**Rationale**:
- Single package works on all platforms (no binary management)
- Consistent with Node.js ecosystem of VSCode extensions
- Easier to update (npm update vs re-downloading binaries)

**Alternatives considered**:
- Keep sqls binaries: Rejected (archived, no updates)
- Build custom LSP: Rejected (massive effort, reinventing wheel)

### 2. Server spawn strategy

**Decision**: Spawn `sql-language-server up --method stdio` as a Node child process.

**Rationale**:
- stdio is the standard LSP communication method
- Same pattern used by sqls currently
- `vscode-languageclient` handles all stdio plumbing

**Implementation**:
```typescript
const serverModule = require.resolve('sql-language-server/dist/bin/cli.js');

const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, args: ['up', '--method', 'stdio'] },
    debug: { module: serverModule, transport: TransportKind.stdio, args: ['up', '--method', 'stdio'] }
};
```

### 3. Connection configuration format

**Decision**: Map dbooly's `ConnectionConfigWithPassword` to sql-language-server's connection format at runtime.

**sql-language-server format** (in `.sqllsrc.json` or LSP init):
```json
{
  "connections": [
    {
      "name": "dev-mysql",
      "adapter": "mysql",
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "password": "secret",
      "database": "mydb"
    }
  ]
}
```

**Mapping**:
| dbooly field | sql-language-server field |
|--------------|---------------------------|
| `name` | `name` |
| `type` | `adapter` (mysql, postgres, sqlite3) |
| `host` | `host` |
| `port` | `port` |
| `username` | `user` |
| `password` | `password` |
| `database` | `database` |
| `filename` (SQLite) | `filename` |

### 4. Connection switching

**Decision**: Use LSP custom method `$/switchDatabase` (if available) or restart server on connection change.

**Rationale**:
- sql-language-server supports runtime connection switching via command
- Falls back to restart if method unavailable (same as current sqls behavior)

**Implementation**:
```typescript
// Try custom method first
try {
    await client.sendRequest('$/switchDatabase', { name: connectionName });
} catch {
    // Fall back to restart
    await this.stop();
    await this.start(connectionId);
}
```

### 5. File structure

**Decision**: Rename `src/sqls/` to `src/lsp/` and create new client file.

```
src/
├── lsp/                              # Renamed from sqls/
│   └── sql-language-server-client.ts # New implementation
└── extension.ts                      # Updated import
```

**Rationale**:
- `lsp/` is more generic and accurate
- Room for future language server additions
- Clean break from sqls naming

## Architecture

### Before (sqls)
```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  extension.ts   │────▶│ SqlsClient   │────▶│ sqls binary │
│                 │     │ (TS wrapper) │     │ (Go, ~25MB) │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │                    │
                               │ spawn child        │ stdio
                               │ process            │
                               └────────────────────┘
```

### After (sql-language-server)
```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│  extension.ts   │────▶│ SqlLanguageServerClient  │────▶│ sql-language-server │
│                 │     │ (TS wrapper)             │     │ (Node.js, ~2MB)     │
└─────────────────┘     └──────────────────────────┘     └─────────────────────┘
                                     │                            │
                                     │ spawn Node                 │ stdio
                                     │ process                    │
                                     └────────────────────────────┘
```

## Risks / Trade-offs

### Risk 1: Completion quality regression
- **Risk**: sql-language-server completions may be less comprehensive
- **Likelihood**: Medium
- **Impact**: Low (completions still work, just fewer suggestions)
- **Mitigation**: Manual testing before release; user can fall back to manual typing

### Risk 2: SQLite support differences
- **Risk**: SQLite handling may differ (file paths vs in-memory)
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**: Test SQLite specifically; document any differences

### Risk 3: Startup time increase
- **Risk**: Node.js server may start slower than Go binary
- **Likelihood**: Low
- **Impact**: Low (server starts lazily on connection activation)
- **Mitigation**: Profile startup time; optimize if needed

## Migration Plan

### Phase 1: Add new implementation (non-breaking)
1. Add `sql-language-server` to package.json dependencies
2. Create `src/lsp/sql-language-server-client.ts`
3. Add feature flag to switch between sqls and sql-language-server (for testing)

### Phase 2: Test and validate
4. Test completions with MySQL connection
5. Test completions with PostgreSQL connection
6. Test completions with SQLite connection
7. Test connection switching
8. Compare completion quality with sqls

### Phase 3: Remove old implementation
9. Remove feature flag, make sql-language-server default
10. Delete `src/sqls/sqls-client.ts`
11. Delete `scripts/download-sqls.js`
12. Delete `bin/` folder
13. Update package.json scripts

### Rollback Plan
- Revert to previous commit
- Re-run `npm run download-sqls`
- No data loss (LSP is stateless)

## Open Questions

1. **Q**: Does sql-language-server support schema introspection for completions?
   - **A**: Yes, it queries the database for table/column names (verified in docs)

2. **Q**: What's the minimum Node.js version required?
   - **A**: Node 14+ (same as VSCode extension host)

3. **Q**: Does it support SSL connections?
   - **A**: Yes, via connection config options (ssl: true/object)
