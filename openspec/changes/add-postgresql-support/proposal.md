# Change: Add PostgreSQL Database Support

## Why
PostgreSQL is the most popular open-source relational database and widely used in production environments. The extension already supports MySQL and SQLite, but many developers need PostgreSQL access during their daily workflow. Adding PostgreSQL support makes dbooly a more complete database tool and fulfills the project's stated goal (project.md lists PostgreSQL as a supported database).

## What Changes
- Add `'postgresql'` to the `DatabaseType` union type
- Create `PostgreSQLConnectionConfig` interface with host, port, database, username, and optional SSL mode
- Create `PostgreSQLSchemaProvider` implementing the existing `SchemaProvider` interface
- Update `ConnectionPool` to handle PostgreSQL connections via the `pg` driver
- Modify connection form to show PostgreSQL-specific fields (including SSL toggle)
- Update connection tester to verify PostgreSQL connections
- Add `pg` as a dependency
- Register the new provider in `schema-provider.ts`

## Impact
- Affected specs: `connection-management`
- Affected code:
  - `src/models/connection.ts` - Add PostgreSQL type definitions
  - `src/providers/postgresql-schema-provider.ts` - NEW file
  - `src/providers/schema-provider.ts` - Register new provider
  - `src/connections/connection-pool.ts` - PostgreSQL connection handling
  - `src/connections/connection-form.ts` - Conditional UI for PostgreSQL
  - `src/connections/connection-tester.ts` - PostgreSQL test function
  - `src/connections/connection-commands.ts` - Display updates for PostgreSQL
  - `package.json` - Add pg dependency
