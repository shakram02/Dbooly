# Change: Replace sqls with sql-language-server

## Why

The current SQL language server (`sqls`) is **archived and no longer maintained**. It cannot be installed through Mason (Neovim) and has known issues that won't be fixed. The project needs a maintained alternative that:

1. Supports MySQL, PostgreSQL, and SQLite (all target databases)
2. Is actively maintained
3. Reduces binary management complexity (no platform-specific binaries)
4. Can be installed via npm (consistent with the extension's Node.js ecosystem)

## What Changes

### Removed
- **sqls binary management**: Remove `scripts/download-sqls.js` and `bin/` folder (~25MB per platform)
- **sqls client implementation**: Remove `src/sqls/sqls-client.ts`
- **Platform-specific binary resolution**: No more darwin/linux/windows binary selection

### Added
- **sql-language-server npm dependency**: Add `sql-language-server` package
- **New LSP client**: Create `src/lsp/sql-language-server-client.ts` with updated config format
- **Multi-connection config support**: Support `.sqllsrc.json`-style connection switching

### Modified
- **package.json**: Replace binary download scripts with npm dependency
- **extension.ts**: Update client import and initialization

## Impact

### Affected Code

| File | Change |
|------|--------|
| [package.json](package.json) | Remove `download-sqls` scripts, add `sql-language-server` dependency |
| [src/sqls/sqls-client.ts](src/sqls/sqls-client.ts) | **DELETE** - Replace with new implementation |
| [src/lsp/sql-language-server-client.ts](src/lsp/sql-language-server-client.ts) | **CREATE** - New LSP client |
| [src/extension.ts](src/extension.ts) | Update import and instantiation |
| [scripts/download-sqls.js](scripts/download-sqls.js) | **DELETE** |
| [bin/](bin/) | **DELETE** - Remove entire folder |

### Bundle Size Impact

| Before | After | Delta |
|--------|-------|-------|
| ~25MB per platform (×3 = 75MB total) | ~2MB (npm package) | **-73MB** |

### Feature Parity Analysis

| Feature | sqls | sql-language-server | Status |
|---------|------|---------------------|--------|
| Completions | ✓ | ✓ | Equal |
| Hover info | ✓ | ✓ | Equal |
| Diagnostics | ✓ | ✓ (via linting) | Equal |
| MySQL support | ✓ | ✓ | Equal |
| PostgreSQL support | ✓ | ✓ | Equal |
| SQLite support | ✓ | ✓ | Equal |
| Dynamic connection switch | Via restart | Via LSP command | **Better** |
| Schema introspection | ✓ | ✓ | Equal |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Completion quality differs | Medium | Low | Test with real queries before release |
| Config format incompatibility | Low | Low | Handle internally in client |
| Node spawn vs binary spawn | Low | Low | Well-tested pattern in VSCode extensions |

## Migration Path

1. Install `sql-language-server` via npm
2. Create new LSP client with updated config format
3. Update extension.ts to use new client
4. Remove sqls binary infrastructure
5. Test completions/hover/diagnostics
6. Remove old sqls code

## Alternatives Considered

### 1. Keep sqls (status quo)
- **Pros**: No migration effort
- **Cons**: Archived, no bug fixes, binary management overhead
- **Verdict**: Rejected - technical debt accumulates

### 2. Postgres Language Server (Supabase)
- **Pros**: Very active, PostgreSQL-focused
- **Cons**: PostgreSQL only, doesn't support MySQL/SQLite
- **Verdict**: Rejected - doesn't meet multi-database requirement

### 3. SQLFluff LSP
- **Pros**: Strong linting
- **Cons**: Linting-focused, not full LSP features
- **Verdict**: Rejected - not a full language server replacement

### 4. sql-language-server (chosen)
- **Pros**: MySQL/PostgreSQL/SQLite, npm package, actively maintained, VSCode extension available
- **Cons**: Slightly less feature-rich than sqls in some areas
- **Verdict**: **Selected** - best balance of features and maintainability
