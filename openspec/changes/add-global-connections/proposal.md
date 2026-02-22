# Change: Add Global Database Connections

## Why
Users who work across many projects often connect to the same development databases (e.g., a local MySQL instance, a shared staging DB). Today, connections are stored per-project in `.vscode/dbooly-connections.json`, so users must re-create the same connection in every project they open. This creates friction and duplicated effort.

Global connections solve this by allowing users to define connections that appear in **every** project, stored in VS Code's per-extension global storage — the same pattern already used by the Scripts feature.

## What Changes
- Add a new storage layer for global connections using `context.globalStorageUri` (a JSON file in the extension's global storage directory)
- Extend `ConnectionStorage` to load/save from both project and global stores, merging them into a unified list
- Add a `scope` property (`"project"` | `"global"`) to `ConnectionConfig` so the system knows where each connection lives
- Add UI affordance: when creating a connection, a "Connection Scope" radio group lets users choose "Global" (default) vs "Project" (disabled if no project is open)
- Show a marker icon on global connections in the tree to distinguish them from project connections
- Allow users to convert an existing project connection to global (and vice versa)
- Starred tables for global connections are stored alongside the global connections file
- Connection name uniqueness is enforced across both scopes (no duplicate names between global and project)
- Migrate existing connections on load: stamp `scope: 'project'` on legacy connections that lack the field and re-save

## Impact
- Affected specs: `connection-management`
- Affected code:
  - `src/models/connection.ts` — add `scope` field to `ConnectionConfig`
  - `src/connections/connection-storage.ts` — add global storage read/write, merge logic
  - `src/connections/connection-manager.ts` — pass scope through CRUD operations
  - `src/connections/connection-commands.ts` — add scope selection in add/edit flows
  - `src/connections/connection-tree-provider.ts` — show scope indicator in tree items
  - `src/extension.ts` — pass `globalStorageUri` to storage layer
  - `package.json` — new commands for scope conversion if needed
