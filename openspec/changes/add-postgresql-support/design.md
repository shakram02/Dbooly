## Context
Dbooly currently supports MySQL and SQLite. PostgreSQL shares MySQL's client-server model (host/port/credentials) but has distinct features: schema namespaces within databases, different system catalogs (`pg_catalog` vs `information_schema`), SSL/TLS connection options, and `$N` parameter placeholders instead of `?`. The existing provider pattern allows clean extension for new database types.

## Goals / Non-Goals
- Goals:
  - Support connecting to PostgreSQL databases with host/port/credentials
  - Browse tables, columns, and data in PostgreSQL databases
  - Execute SQL queries against PostgreSQL databases
  - Detect primary keys and foreign keys
  - Support SSL/TLS connections
  - Maintain feature parity with existing MySQL support
- Non-Goals:
  - Advanced PostgreSQL features (materialized views, extensions, custom types, partitions)
  - Multiple schema browsing (default to `public` schema; multi-schema can be added later)
  - PgBouncer or connection proxy support
  - SSH tunnel connections
  - Certificate-based authentication (client certs)

## Decisions

### Decision: Use `pg` (node-postgres) driver
Use the `pg` package for PostgreSQL connections.

**Rationale**:
- Most widely used Node.js PostgreSQL driver (19M+ weekly downloads)
- Supports both callbacks and promises
- Built-in connection pooling
- Well-maintained with active community
- Supports SSL/TLS natively

**Alternatives considered**:
- `postgres` (Postgres.js): Modern tagged-template API, but less conventional and different query pattern than mysql2
- `pg-promise`: Adds abstraction on top of `pg`; unnecessary since we have our own provider pattern
- `typeorm`/`knex`: Query builders; overkill for raw schema queries

### Decision: Use `pg.Client` for connections (not `pg.Pool`)
Use individual `Client` connections managed by our existing `ConnectionPool` class, rather than `pg`'s built-in `Pool`.

**Rationale**:
- Consistent with how MySQL connections are managed (one connection per pool entry)
- Our `ConnectionPool` already handles lifecycle, health checks, and cleanup
- Avoids double-pooling complexity
- Simpler mental model for the codebase

### Decision: Use `information_schema` for metadata queries
Query PostgreSQL metadata via `information_schema` views rather than `pg_catalog` tables.

**Rationale**:
- SQL standard — same approach used for MySQL's schema provider
- More readable and portable queries
- Sufficient for our use cases (tables, columns, keys)

**Alternatives considered**:
- `pg_catalog` tables: Lower-level, more complete, but PostgreSQL-specific and harder to read
- Mix of both: Unnecessary complexity for current feature scope

### Decision: Double-quote identifier escaping
Use double quotes for PostgreSQL identifier escaping, consistent with the SQL standard.

**Rationale**: PostgreSQL uses double quotes as the standard identifier quoting mechanism. This is the same approach used for SQLite, as specified in `project.md` line 178.

### Decision: Default to `public` schema
Browse only the `public` schema by default, filtering out system schemas (`pg_catalog`, `information_schema`).

**Rationale**:
- `public` is the default schema for most PostgreSQL setups
- Multi-schema browsing adds UI complexity (schema selector, tree nesting)
- Can be extended later with a schema picker

### Decision: Use `$N` parameterized queries
Use PostgreSQL's native `$1, $2, ...` parameter placeholders.

**Rationale**: The `pg` driver uses numbered parameter placeholders natively. Unlike MySQL's `?` placeholders, PostgreSQL requires `$N` syntax. This is handled within the provider implementation and is transparent to the rest of the codebase.

### Decision: Support optional SSL with `rejectUnauthorized: false` default
Provide an SSL toggle in the connection form. When enabled, default to `rejectUnauthorized: false` for development convenience.

**Rationale**:
- Many development PostgreSQL instances use self-signed certificates
- Production setups can override with proper certificates later
- Matches the behavior most developers expect from a dev tool

## Risks / Trade-offs

### Risk: SSL certificate validation
Defaulting `rejectUnauthorized: false` is insecure for production.
- **Mitigation**: Document this in the connection form tooltip. Future enhancement can add certificate path fields.

### Risk: Schema assumption
Defaulting to `public` schema won't work for all PostgreSQL setups.
- **Mitigation**: Schema browsing is scoped to a future enhancement. `public` covers the vast majority of use cases.

### Risk: Large query results
PostgreSQL can return very large result sets that may overwhelm the webview.
- **Mitigation**: Existing `LIMIT` defaults and pagination apply. No PostgreSQL-specific risk beyond what MySQL already handles.

### Risk: Connection timeouts
Remote PostgreSQL instances may have higher latency than local MySQL/SQLite.
- **Mitigation**: Use the existing `QueryExecutionOptions.timeout` and `AbortSignal` cancellation support.

## Migration Plan
N/A - This is new functionality, no migration needed. Existing MySQL and SQLite connections are unaffected.

## Open Questions
None — resolved:
- **Default port pre-fill**: Yes. Pre-fill 5432, consistent with MySQL defaulting to 3306.
- **`search_path` / non-public schemas**: No. Bare minimum for initial release — `public` schema only.
