## Context
This is the first major feature for dbooly, establishing patterns that future capabilities will follow. The connection management system needs to be simple yet extensible for additional database types later.

## Goals / Non-Goals
- **Goals:**
  - Simple, working connection CRUD with MySQL support
  - Secure credential storage using VSCode APIs
  - Workspace-local persistence (per-project connections)
  - Self-contained implementation (all logic in dedicated module)

- **Non-Goals:**
  - Connection pooling (future feature)
  - Global/user-level connections (workspace-only for now)
  - Multiple database type support in this change (MySQL only)

## Decisions

### Decision: Workspace-local JSON file for persistence
Connection metadata stored in `.vscode/dbooly-connections.json`.

**Rationale:**
- Allows per-project connection configurations
- Can be committed to version control (credentials excluded)
- Simple to implement and debug
- Standard VSCode extension pattern

**Alternatives considered:**
- VSCode globalState: Rejected because connections are typically project-specific
- SQLite database: Over-engineered for simple key-value storage

### Decision: Self-contained module architecture
All connection logic lives in `src/connections/` with no external model dependencies. Database queries (when testing connections) happen directly in the connection module.

**Rationale:**
- Keeps the feature isolated and testable
- Follows explicit design preference for self-contained usecases
- Avoids premature abstractions

### Decision: SecretStorage for passwords only
Only passwords go to SecretStorage; other config in JSON file.

**Rationale:**
- SecretStorage API is async and slightly complex
- Other fields (host, port, database name) are not sensitive
- JSON file remains human-readable for debugging

### Decision: UUID-based connection identifiers
Each connection gets a random UUID as its identifier.

**Rationale:**
- Allows renaming connections without breaking references
- Unique across workspaces if connections are ever shared
- Simple to generate with `crypto.randomUUID()`

### Decision: Hybrid UI approach
- **Connection form:** Webview panel with vanilla HTML/CSS/JS - shows all fields at once for better UX
- **Tree view:** Native `TreeDataProvider` for sidebar navigation
- **Dialogs:** Native APIs (`showQuickPick`, `showWarningMessage`) for selection and confirmation

**Rationale:**
- Webview form provides better UX than sequential input boxes (all fields visible at once)
- No framework needed - vanilla HTML with VSCode CSS variables for theming
- Tree view uses native API for performance and native look
- Confirmation dialogs stay native for consistency

**Alternatives considered:**
- Sequential `showInputBox` calls: Rejected - poor UX, user can't see/edit all fields at once
- React webview: Rejected - overkill for a simple form, adds build complexity

## Risks / Trade-offs

- **Risk:** `.vscode/` folder may be gitignored
  - *Mitigation:* Document that connections file can be committed; users can choose to gitignore or commit

- **Risk:** SecretStorage requires VSCode 1.53+
  - *Mitigation:* Modern VSCode versions all support this; document minimum version

## Migration Plan
Not applicable - this is a new feature with no existing data.

## Open Questions
None - scope is well-defined for MySQL CRUD with file persistence.
