# Change: Add Connection Management

## Why
dbooly needs the ability to create, store, and manage database connections before users can perform any database operations. This is the foundational capability that enables all other features (schema inspection, query execution, data management).

## What Changes
- Add connection configuration model with MySQL support
- Implement connection CRUD operations (create, read, update, delete)
- Store connection configurations in workspace-local JSON file
- Store credentials securely using VSCode SecretStorage API
- Add connection testing before saving
- Register VSCode commands for connection operations

## Impact
- Affected specs: `connection-management` (new capability)
- Affected code:
  - New `src/connections/` module for connection logic
  - New `src/models/connection.ts` for type definitions
  - Updates to `src/extension.ts` for command registration
