## Context
Connections are currently project-scoped, stored in `.vscode/dbooly-connections.json`. Users who connect to the same databases across multiple projects must re-create connections in each project. The Scripts feature already uses global storage (`globalState` + `globalStorageUri`), establishing a precedent for cross-project persistence in this extension.

## Goals / Non-Goals
- Goals:
  - Allow connections to be stored globally (visible in all projects)
  - Merge global and project connections seamlessly in the UI
  - Preserve backwards compatibility with existing project connections
  - Allow converting between scopes
- Non-Goals:
  - Sync connections across machines (that's VS Code Settings Sync territory)
  - Import/export connections to file (separate feature)
  - Folders or grouping of connections by scope in the tree view

## Decisions

### Decision: Use `globalStorageUri` for global connection file storage
Store global connections as a JSON file at `<context.globalStorageUri>/dbooly-global-connections.json`.

- **Why**: Matches the pattern used by Scripts (`globalStorageUri` for files). The `globalState` API is limited to simple key-value pairs and has size limits. A dedicated JSON file allows the same `StoredConnections` shape (connections + starredTables) and is easier to debug.
- **Alternatives considered**:
  - `vscode.workspace.getConfiguration()` (global settings): Settings are synced, which could leak connection metadata to the cloud. Settings also have a more complex read/write API and aren't designed for structured data.
  - `context.globalState`: Works for small data but less transparent for debugging. Would require a different serialization approach since it stores primitives/objects per key.

### Decision: Add `scope` field to `ConnectionConfig` as a discriminator
Add `scope: 'project' | 'global'` to `BaseConnectionConfig`. Default to `'project'` for backwards compatibility (existing connections without `scope` are treated as project connections). The UI default for **new** connections is `'global'`.

- **Why**: The connection model is the single source of truth for each connection's properties. Embedding scope there makes it available everywhere without cross-referencing storage layers.
- **Alternatives considered**:
  - Infer scope from which storage loaded the connection: Fragile — after merging, you lose the origin. Makes scope conversion harder.
  - Separate type (`GlobalConnectionConfig` vs `ProjectConnectionConfig`): Over-engineering for a single boolean-like field.

### Decision: Passwords stay in SecretStorage with the same key scheme
Passwords already use `dbooly.connection.password.<connectionId>` in VS Code's SecretStorage (OS keychain). SecretStorage is already global (not project-scoped), so no change is needed for password storage.

- **Why**: SecretStorage is the most secure option, and it already works across projects. Connection IDs are deterministic (SHA-256 of name), so the same connection name always gets the same ID and password key, regardless of scope.

### Decision: Name uniqueness enforced across both scopes
A connection name must be unique across project AND global connections. This prevents confusion when two connections with the same name but different configs appear in the tree.

- **Why**: The deterministic ID generation (`SHA-256(name)`) means two connections with the same name would collide on ID, causing password storage conflicts.

### Decision: Scope divider sections in tree view, project first
When both project and global connections exist, the tree view groups them under collapsible "Project" and "Global" divider nodes (with globe / folder icons and connection counts). When only one scope has connections, the dividers are omitted and connections appear as a flat list. All connections use the database icon regardless of scope.

- **Why**: Divider sections clearly separate scopes without needing icon badges or description text on each connection. Showing dividers only when both scopes are populated avoids unnecessary nesting for the common single-scope case.
- **Alternatives considered**:
  - Globe icon overlay on each global connection: VS Code's `ThemeIcon` doesn't support compositing. Custom SVGs cause publishing issues with VSCE.
  - Flat list with globe icon replacement: Loses the database icon, which is the primary visual identity for connections.
  - Description text only ("type — Global"): Subtle, easy to miss.

### Decision: Composition for storage architecture
`ConnectionStorage` is extended via composition — a new `GlobalConnectionStorage` class wraps the global file operations, and the existing `ConnectionStorage` continues to handle project-scoped files. `ConnectionManager` holds references to both and routes reads/writes based on `scope`.

- **Why**: Keeps each storage class focused on one file. Avoids bloating the existing `ConnectionStorage` with conditional logic. Easier to test in isolation.
- **Alternatives considered**:
  - Extend `ConnectionStorage` with subclass: Tightly couples global logic to the project storage class, harder to test.
  - Single class with mode flag: Conditional branching throughout, harder to follow.

### Decision: Scope conversion requires confirmation prompt
When the user converts a connection between project and global scope, a confirmation dialog is shown before proceeding.

- **Why**: Prevents accidental clicks from moving a connection to an unintended scope. The operation is reversible but not immediately obvious (the connection disappears from one storage and appears in another), so a quick confirmation reduces user confusion.

### Decision: SQLite global connections — no path restrictions
Global SQLite connections are allowed with any file path (absolute or relative). No validation is performed against the current project.

- **Why**: The user is responsible for ensuring the path is valid. Many global SQLite connections will use absolute paths to fixed locations (e.g., `~/data/app.db`). Adding path warnings would create noise for the common case.

### Decision: UI default is "Global", storage default is "project"
New connections default to "Global" scope in the form UI, since users typically want their databases available everywhere. However, the **storage** default for the `scope` field is `'project'` for backwards compatibility — connections loaded from existing `.vscode/dbooly-connections.json` files without a `scope` field are treated as project-scoped.

## Risks / Trade-offs
- **ID collisions across scopes**: Mitigated by enforcing name uniqueness across both scopes. Same name = same ID = conflict.
- **Migration of existing connections**: Existing `.vscode/dbooly-connections.json` files are auto-migrated on load. Connections without a `scope` field are stamped with `scope: 'project'` and the file is re-saved.
- **Extension size**: Negligible — this is a logic change, no new dependencies.

## Migration Plan
- No breaking changes. Existing project connections continue to work as-is.
- On load, if any connection lacks a `scope` field, it is stamped with `scope: 'project'` and the file is re-saved (one-time auto-migration).
- Global connections start empty and users opt in.

## Open Questions
- None at this time.
