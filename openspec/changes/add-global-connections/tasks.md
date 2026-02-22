## 1. Data Model
- [x] 1.1 Add `scope: 'project' | 'global'` to `BaseConnectionConfig` in `src/models/connection.ts`
- [x] 1.2 Add `ConnectionScope` type alias and default value constant

## 2. Global Storage Layer
- [x] 2.1 Add `GlobalConnectionStorage` class (composed alongside `ConnectionStorage`) to read/write `<globalStorageUri>/dbooly-global-connections.json`
- [x] 2.2 Implement `loadGlobalConnections()` with same shape as project storage (`StoredConnections`)
- [x] 2.3 Implement `saveGlobalConnections()` with same shape
- [x] 2.4 Implement global starred tables load/save within the global connections file
- [x] 2.5 Handle missing global storage directory (create on first write)

## 3. Connection Manager Updates
- [x] 3.1 Accept `globalStorageUri` in `ConnectionManager` or `ConnectionStorage` constructor
- [x] 3.2 Update `initialize()` to load and merge project + global connections (project first, then global)
- [x] 3.3 Update `addConnection()` to route to correct storage based on `scope`
- [x] 3.4 Update `updateConnection()` to save to correct storage based on `scope`
- [x] 3.5 Update `deleteConnection()` to delete from correct storage based on `scope`
- [x] 3.6 Enforce name uniqueness across both scopes in `findByName()`
- [x] 3.7 Handle "no project open" case: allow global connections only, disable project-scoped writes

## 4. Scope Conversion
- [x] 4.1 Implement `convertConnectionScope(id, targetScope)` method in `ConnectionManager`
- [x] 4.2 Show confirmation dialog before performing scope conversion
- [x] 4.3 Migrate starred tables during scope conversion
- [x] 4.4 Guard against converting to project when no project is open

## 5. Extension Activation
- [x] 5.1 Pass `context.globalStorageUri` to storage/manager layer in `src/extension.ts`
- [x] 5.2 Ensure global connections load even when no project is open

## 6. Connection Form UI
- [x] 6.1 Add "Connection Scope" radio group (Global / Project) to the add connection webview form
- [x] 6.2 Default scope to "Global" (always); disable "Project" when no project is open
- [x] 6.3 Show scope on the edit connection form, allow changing it
- [x] 6.4 Disable "Project" option when no project is open, with explanatory note

## 7. Connection Tree View
- [x] 7.1 Show globe icon on global connections in the tree view
- [x] 7.2 Add "Make Global" / "Make Project" context menu items
- [x] 7.3 Register new context menu commands in `package.json`
- [x] 7.4 Filter context menu based on current scope (`contextValue`)

## 8. Backwards Compatibility & Migration
- [x] 8.1 On load, stamp `scope: 'project'` on any connection missing the field
- [x] 8.2 Re-save the file after stamping (one-time auto-migration, skip re-save if no changes)
- [x] 8.3 Verify existing `.vscode/dbooly-connections.json` files load and migrate correctly
