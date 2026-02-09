## Context
Dbooly currently supports MySQL only. SQLite is a file-based database with fundamentally different connection semantics - no host/port/credentials, just a file path. The existing provider pattern allows clean extension for new database types.

## Goals / Non-Goals
- Goals:
  - Support connecting to SQLite database files
  - Browse tables, columns, and data in SQLite databases
  - Execute SQL queries against SQLite databases
  - Maintain parity with MySQL feature set
- Non-Goals:
  - SQLite encryption (SEE/SQLCipher) support
  - Creating new SQLite databases (only open existing)
  - In-memory SQLite databases

## Decisions

### Decision: Use discriminated union types for ConnectionConfig
Use TypeScript discriminated unions with `type` as discriminant rather than optional fields.

**Rationale**:
- Exhaustive type checking in switch statements
- Cleaner type narrowing with type guards
- Clear separation between MySQL (host/port/creds) and SQLite (filePath only)

**Alternatives considered**:
- Optional fields: Rejected because it allows invalid states (SQLite with host, MySQL without host)
- Separate config interfaces without union: Rejected because it complicates common handling

### Decision: Use better-sqlite3 over sql.js
Use `better-sqlite3` (native bindings) instead of `sql.js` (WASM).

**Rationale**:
- Better performance for larger databases
- Synchronous API is simpler to work with
- Direct file access (sql.js requires loading entire DB into memory)

**Alternatives considered**:
- sql.js: No native compilation required, but slower and memory-intensive for large DBs
- sqlite3: Async callback-based API, less ergonomic than better-sqlite3

### Decision: Double-quote identifier escaping
Use double quotes for SQLite identifier escaping (not backticks).

**Rationale**: Double quotes are the SQL standard and SQLite default.

### Decision: Synchronous operations acceptable for MVP
Accept that `better-sqlite3` is synchronous and may block for long queries.

**Rationale**: Most SQLite databases are local and queries are fast. Worker thread isolation can be added later if needed.

## Risks / Trade-offs

### Risk: Native module compilation
`better-sqlite3` requires node-gyp and native compilation.
- **Mitigation**: Document build requirements; consider bundling prebuilt binaries or falling back to sql.js if compilation fails.

### Risk: Blocking extension host
Long-running SQLite queries will block the VS Code extension host.
- **Mitigation**: Add query timeout; consider worker_threads for true async in future.

### Risk: File path portability
Absolute file paths in connection config may not work across machines.
- **Mitigation**: Document that paths are workspace-local; consider supporting workspace-relative paths later.

## Migration Plan
N/A - This is new functionality, no migration needed.

## Open Questions
- Should we support creating new empty SQLite databases, or only opening existing ones?
- Should we support workspace-relative paths for SQLite files?
