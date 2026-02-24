## Context

PostgreSQL has no `SHOW CREATE TABLE` command. Every major database tool (pg_dump, pgAdmin, DBeaver, DataGrip) reconstructs DDL by querying system catalogs. This design documents the specific queries and assembly logic for our PostgreSQL `getTableDDL` implementation.

MySQL and SQLite are trivial (single query each) and don't require design documentation.

## Goals / Non-Goals

- **Goal**: Generate a valid, re-executable `CREATE TABLE` statement that covers columns, types, defaults, NOT NULL, and table-level constraints (PK, FK, UNIQUE, CHECK)
- **Goal**: Use `pg_catalog` over `information_schema` for richer PostgreSQL-specific metadata
- **Goal**: Use PostgreSQL's built-in helper functions (`pg_get_constraintdef`, `pg_get_expr`) to avoid manual reconstruction of constraint/expression syntax
- **Non-Goal**: Full `pg_dump` parity (indexes, triggers, RLS, tablespaces, storage params, partitions, sequences/identity, comments, ACLs)
- **Non-Goal**: DDL for views — only tables are supported in this change

## Decisions

### Use `pg_catalog` instead of `information_schema`

`information_schema` is SQL-standard and portable, but it:
- Doesn't expose CHECK constraint definitions as text
- Simplifies PostgreSQL-specific types (e.g., reports `integer` instead of `serial`)
- Doesn't expose expression-based defaults cleanly

`pg_catalog` is PostgreSQL-specific but gives us everything we need with helper functions that return ready-to-use SQL fragments. Every major PostgreSQL tool uses this approach.

### Two queries, not one

We issue two separate queries rather than one complex join:

1. **Column query** — ordered list of columns with types, defaults, nullability
2. **Constraint query** — all table-level constraints as SQL fragments

This keeps each query simple and avoids the row multiplication that happens when joining columns with constraints.

## PostgreSQL Queries

### Query 1: Columns

```sql
SELECT
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS not_null,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_value
FROM pg_catalog.pg_attribute a
LEFT JOIN pg_catalog.pg_attrdef d
    ON a.attrelid = d.adrelid AND a.attnum = d.adnum
WHERE a.attrelid = $1::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
ORDER BY a.attnum;
```

Key details:
- `format_type()` returns the human-readable type with modifiers (e.g., `character varying(255)`, `numeric(10,2)`)
- `pg_get_expr()` returns the default expression as re-executable SQL (e.g., `nextval('users_id_seq'::regclass)`, `'active'::character varying`)
- `attnum > 0` excludes system columns; `NOT attisdropped` excludes dropped columns
- `$1::regclass` safely resolves the table name to an OID (throws error if table doesn't exist, which handles our "table not found" scenario)

### Query 2: Constraints

```sql
SELECT
    conname AS constraint_name,
    pg_catalog.pg_get_constraintdef(c.oid, true) AS constraint_def
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = $1::regclass
ORDER BY
    CASE c.contype
        WHEN 'p' THEN 0  -- PRIMARY KEY first
        WHEN 'u' THEN 1  -- UNIQUE
        WHEN 'f' THEN 2  -- FOREIGN KEY
        WHEN 'c' THEN 3  -- CHECK
        ELSE 4
    END;
```

Key details:
- `pg_get_constraintdef(oid, true)` returns the full constraint definition as SQL, with the `true` argument for pretty-printing
- Returns strings like `PRIMARY KEY (id)`, `FOREIGN KEY (org_id) REFERENCES orgs(id)`, `CHECK ((age > 0))`
- Ordered by type so PRIMARY KEY appears first in the output, matching convention

### DDL Assembly (TypeScript pseudocode)

```
CREATE TABLE "tableName" (
    -- For each column:
    "col_name" data_type [NOT NULL] [DEFAULT expr],
    ...
    -- For each constraint:
    CONSTRAINT "constraint_name" constraint_def,
    ...
);
```

- Table and column names are double-quote escaped using the existing `escapeIdentifier()` helper
- Trailing comma removed from the last entry
- Semicolon appended at the end

## Risks / Trade-offs

- **Incomplete DDL**: We intentionally omit indexes, triggers, sequences, comments, and advanced features. This covers the majority of developer use cases but may surprise users expecting full `pg_dump` output. A future enhancement can add these progressively.
- **`serial` vs `integer + DEFAULT nextval()`**: PostgreSQL internally expands `serial` to `integer` with a sequence default. Our DDL will show the expanded form, not the original shorthand. This is the same behavior as pg_dump and pgAdmin — the DDL is functionally equivalent but not identical to what was originally written.
- **Schema qualification**: We currently scope to `public` schema only (matching existing `listTables` behavior). Multi-schema support is out of scope.

## Open Questions

None — the approach is well-established across the PostgreSQL ecosystem.
