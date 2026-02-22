import * as vscode from 'vscode';
import { ConnectionManager } from './connection-manager';
import { ConnectionPool } from './connection-pool';
import { ConnectionConfig, ConnectionId, isMySQLConnection, isPostgreSQLConnection } from '../models/connection';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { getSchemaProvider, SortOptions } from '../providers/schema-provider';
import { TableSearchPanel } from '../views/table-search-panel';
import { TableDataPanel } from '../views/table-data-panel';

// Simple LRU cache with TTL
class LRUCache<K, V> {
    private cache = new Map<K, { value: V; timestamp: number }>();
    constructor(private maxSize: number, private ttlMs: number) {}

    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key: K, value: V): void {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, timestamp: Date.now() });
    }

    delete(key: K): void {
        this.cache.delete(key);
    }

    clearByPrefix(prefix: string): void {
        for (const key of this.cache.keys()) {
            if (String(key).startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }
}

function sortTablesStarredFirst(tables: TableInfo[], starredSet: Set<string>): TableInfo[] {
    return [...tables].sort((a, b) => {
        const aStarred = starredSet.has(a.name);
        const bStarred = starredSet.has(b.name);
        if (aStarred && !bStarred) return -1;
        if (!aStarred && bStarred) return 1;
        return a.name.localeCompare(b.name);
    });
}

export class ColumnTreeItem extends vscode.TreeItem {
    constructor(public readonly column: ColumnInfo) {
        super(column.name, vscode.TreeItemCollapsibleState.None);

        this.description = column.dataType;
        this.contextValue = 'column';

        // Icon based on key type
        if (column.keyType === 'PRIMARY') {
            this.iconPath = new vscode.ThemeIcon('key');
        } else if (column.keyType === 'FOREIGN') {
            this.iconPath = new vscode.ThemeIcon('references');
        } else {
            this.iconPath = new vscode.ThemeIcon('symbol-field');
        }

        // Tooltip with full metadata
        const lines = [
            column.name,
            `Type: ${column.dataType}`,
            `Nullable: ${column.nullable ? 'Yes' : 'No'}`,
        ];
        if (column.keyType) {
            lines.push(`Key: ${column.keyType}`);
        }
        if (column.foreignKeyRef) {
            lines.push(`References: ${column.foreignKeyRef.table}.${column.foreignKeyRef.column}`);
        }
        if (column.defaultValue !== null) {
            lines.push(`Default: ${column.defaultValue}`);
        }
        this.tooltip = lines.join('\n');
    }
}

export class LoadingTreeItem extends vscode.TreeItem {
    constructor() {
        super('Loading...', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }
}

export class ErrorTreeItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('error');
    }
}

export class EmptyTreeItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
    }
}

export class TableTreeItem extends vscode.TreeItem {
    constructor(
        public readonly table: TableInfo,
        public readonly starred: boolean = false,
    ) {
        super(table.name, vscode.TreeItemCollapsibleState.Collapsed);

        this.tooltip = `${table.name} (${table.type})${starred ? ' ★' : ''}`;
        this.description = table.type;
        this.contextValue = starred ? 'table-starred' : 'table';
        this.iconPath = starred
            ? new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'))
            : new vscode.ThemeIcon('symbol-class');

        // Double-click triggers viewTableData command
        this.command = {
            command: 'dbooly.viewTableData',
            title: 'View Table Data',
            arguments: [this],
        };
    }
}

export class ScopeDividerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly scope: 'project' | 'global',
        public readonly connectionCount: number,
    ) {
        super(
            scope === 'project' ? 'Project' : 'Global',
            vscode.TreeItemCollapsibleState.Expanded,
        );
        this.description = `${connectionCount}`;
        this.contextValue = 'scope-divider';
        this.iconPath = scope === 'global'
            ? new vscode.ThemeIcon('globe')
            : new vscode.ThemeIcon('root-folder');
    }
}

export class ConnectionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly connection: ConnectionConfig,
        public readonly tablesLoaded: boolean = false,
        public readonly isActive: boolean = false,
    ) {
        super(connection.name, vscode.TreeItemCollapsibleState.Collapsed);

        // Type-specific tooltip
        if (isMySQLConnection(connection)) {
            this.tooltip = `${connection.username}@${connection.host}:${connection.port}/${connection.database}${isActive ? ' (Active)' : ''}`;
        } else if (isPostgreSQLConnection(connection)) {
            this.tooltip = `${connection.username}@${connection.host}:${connection.port}/${connection.database}${connection.ssl ? ' (SSL)' : ''}${isActive ? ' (Active)' : ''}`;
        } else {
            this.tooltip = `${connection.filePath}${isActive ? ' (Active)' : ''}`;
        }
        this.description = connection.type;

        // Context value includes active state and scope for context menu filtering
        const isGlobal = connection.scope === 'global';
        const scopePrefix = isGlobal ? 'connection-global' : 'connection-project';
        if (isActive) {
            this.contextValue = tablesLoaded ? `${scopePrefix}-loaded-active` : `${scopePrefix}-active`;
        } else {
            this.contextValue = tablesLoaded ? `${scopePrefix}-loaded` : scopePrefix;
        }

        // Database icon for all connections; active connections get green tint
        this.iconPath = isActive
            ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('database');

        // ARIA label for accessibility
        this.accessibilityInformation = {
            label: `${connection.name} database connection${isGlobal ? ', global' : ''}${isActive ? ', active' : ''}`,
            role: 'treeitem',
        };
    }
}

export type TreeItem = ScopeDividerTreeItem | ConnectionTreeItem | TableTreeItem | ColumnTreeItem | LoadingTreeItem | ErrorTreeItem | EmptyTreeItem;

export class ConnectionTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tableCache: Map<ConnectionId, TableInfo[]> = new Map();
    private columnCache = new LRUCache<string, ColumnInfo[]>(100, 10 * 60 * 1000); // 100 tables, 10 min TTL
    private disposables: vscode.Disposable[] = [];
    // Track connections that are currently loading tables
    private loadingConnections: Set<ConnectionId> = new Set();
    // Track connections that failed to load (prevents infinite retry on tree re-render)
    private failedConnections: Map<ConnectionId, string> = new Map();

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool,
    ) {
        // Subscribe to active connection changes to refresh tree styling
        this.disposables.push(
            this.connectionManager.onDidChangeActiveConnection(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }

    refresh(): void {
        this.tableCache.clear();
        this.columnCache.clear();
        this.failedConnections.clear();
        this._onDidChangeTreeData.fire();
    }

    refreshConnection(connectionId: ConnectionId): void {
        this.tableCache.delete(connectionId);
        this.columnCache.clearByPrefix(`${connectionId}:`);
        this.failedConnections.delete(connectionId);
        this._onDidChangeTreeData.fire();
    }

    fireTreeDataChange(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            return this.getRootChildren();
        }

        if (element instanceof ScopeDividerTreeItem) {
            return this.getConnectionsForScope(element.scope);
        }

        if (element instanceof ConnectionTreeItem) {
            return this.getTablesForConnection(element.connection);
        }

        if (element instanceof TableTreeItem) {
            return this.getColumnsForTable(element.table);
        }

        return [];
    }

    private getRootChildren(): TreeItem[] {
        const all = this.connectionManager.getAllConnections();
        const project = all.filter(c => c.scope === 'project');
        const global = all.filter(c => c.scope === 'global');

        const items: TreeItem[] = [];

        // Only show dividers when both scopes have connections
        if (project.length > 0 && global.length > 0) {
            items.push(new ScopeDividerTreeItem('project', project.length));
            items.push(new ScopeDividerTreeItem('global', global.length));
        } else {
            // Single scope — show connections directly without dividers
            const activeId = this.connectionManager.getActiveConnectionId();
            for (const conn of all) {
                items.push(new ConnectionTreeItem(conn, this.tableCache.has(conn.id), conn.id === activeId));
            }
        }

        return items;
    }

    private getConnectionsForScope(scope: 'project' | 'global'): TreeItem[] {
        const all = this.connectionManager.getAllConnections();
        const filtered = all.filter(c => c.scope === scope);
        const activeId = this.connectionManager.getActiveConnectionId();
        return filtered.map(conn => new ConnectionTreeItem(conn, this.tableCache.has(conn.id), conn.id === activeId));
    }

    private getTablesForConnection(connection: ConnectionConfig): TreeItem[] {
        // Check if we have cached data
        const cached = this.tableCache.get(connection.id);
        if (cached) {
            const starredSet = this.connectionManager.getStorageForScope(connection.scope).getStarredTables(connection.id);
            const sorted = sortTablesStarredFirst(cached, starredSet);
            return sorted.map(t => new TableTreeItem(t, starredSet.has(t.name)));
        }

        // Show error if previously failed (user can retry via toast or refresh button)
        const failureMessage = this.failedConnections.get(connection.id);
        if (failureMessage) {
            return [new ErrorTreeItem(failureMessage)];
        }

        // Check if already loading
        if (this.loadingConnections.has(connection.id)) {
            return [new LoadingTreeItem()];
        }

        // Start loading in background
        this.loadingConnections.add(connection.id);
        this.fetchTablesInBackground(connection.id);

        return [new LoadingTreeItem()];
    }

    private async fetchTablesInBackground(connectionId: ConnectionId): Promise<void> {
        try {
            await this.fetchTablesForConnection(connectionId);
        } finally {
            this.loadingConnections.delete(connectionId);
            this._onDidChangeTreeData.fire();
        }
    }

    private async getColumnsForTable(table: TableInfo): Promise<TreeItem[]> {
        const cacheKey = `${table.connectionId}:${table.name}`;
        const cached = this.columnCache.get(cacheKey);
        if (cached) {
            if (cached.length === 0) {
                return [new EmptyTreeItem('No columns')];
            }
            return cached.map(c => new ColumnTreeItem(c));
        }

        const connection = this.connectionManager.getConnection(table.connectionId);
        if (!connection) {
            return [new ErrorTreeItem('Connection not found')];
        }

        try {
            const columns = await this.connectionManager.withAuthenticatedConnection(
                table.connectionId,
                async (configWithPassword) => {
                    const provider = getSchemaProvider(connection.type);
                    return provider.listColumns(this.connectionPool, configWithPassword, table.name);
                }
            );

            if (columns === null) {
                return [new ErrorTreeItem('No password set')];
            }

            this.columnCache.set(cacheKey, columns);

            if (columns.length === 0) {
                return [new EmptyTreeItem('No columns')];
            }
            return columns.map(c => new ColumnTreeItem(c));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return [new ErrorTreeItem(`Failed to load: ${message}`)];
        }
    }

    async fetchTablesForConnection(connectionId: ConnectionId): Promise<TableInfo[]> {
        const cached = this.tableCache.get(connectionId);
        if (cached) {
            // Don't change active connection when returning cached data
            // This prevents loops when tree re-renders for styling changes
            return cached;
        }

        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        try {
            const tables = await this.connectionManager.withAuthenticatedConnection(
                connectionId,
                async (configWithPassword) => {
                    const provider = getSchemaProvider(connection.type);
                    return provider.listTables(this.connectionPool, configWithPassword);
                }
            );

            if (tables === null) {
                // Password prompt cancelled
                return [];
            }

            this.tableCache.set(connectionId, tables);

            // Auto-activate connection on successful FIRST expansion (not cached)
            // setActiveConnection is a no-op if already active
            this.connectionManager.setActiveConnection(connectionId);

            return tables;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.failedConnections.set(connectionId, `Failed to connect: ${message}`);
            // Clear active connection if this failed connection was active
            if (this.connectionManager.getActiveConnectionId() === connectionId) {
                this.connectionManager.setActiveConnection(null);
            }
            vscode.window.showErrorMessage(
                `Failed to list tables for "${connection.name}": ${message}`,
                'Retry'
            ).then(action => {
                if (action === 'Retry') {
                    this.refreshConnection(connectionId);
                }
            });
            return [];
        }
    }
}

export function registerTreeView(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    connectionPool: ConnectionPool,
): ConnectionTreeProvider {
    const treeProvider = new ConnectionTreeProvider(connectionManager, connectionPool);

    const treeView = vscode.window.createTreeView('dbooly.connections', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Switch active connection when clicking a loaded connection in the tree.
    // Connections are first activated on successful table fetch (fetchTablesForConnection),
    // subsequent clicks switch between known-good connections.
    treeView.onDidChangeSelection((e) => {
        const selected = e.selection[0];
        if (selected instanceof ConnectionTreeItem && selected.tablesLoaded) {
            connectionManager.setActiveConnection(selected.connection.id);
        }
    });

    context.subscriptions.push(treeView);
    context.subscriptions.push({ dispose: () => treeProvider.dispose() });

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.refreshConnections', () => {
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.selectConnection', (connectionId: ConnectionId) => {
            const conn = connectionManager.getConnection(connectionId);
            if (conn) {
                vscode.window.showInformationMessage(`Selected: ${conn.name}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.searchTables', (item: ConnectionTreeItem) => {
            const connection = item?.connection;
            if (!connection) {
                vscode.window.showErrorMessage('Please select a connection to search tables.');
                return;
            }

            const storage = connectionManager.getStorageForScope(connection.scope);
            TableSearchPanel.show(
                context.extensionUri,
                connection,
                () => treeProvider.fetchTablesForConnection(connection.id),
                (table) => {
                    const starred = storage.isTableStarred(connection.id, table.name);
                    vscode.commands.executeCommand('dbooly.viewTableData', new TableTreeItem(table, starred));
                },
                () => storage.getStarredTables(connection.id),
                async (tableName, starred) => {
                    storage.setTableStarred(connection.id, tableName, starred);
                    await connectionManager.saveStarredTablesForScope(connection.scope);
                    treeProvider.fireTreeDataChange();
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.starTable', async (item: TableTreeItem) => {
            const table = item?.table;
            if (!table) return;

            const connection = connectionManager.getConnection(table.connectionId);
            if (!connection) return;

            const storage = connectionManager.getStorageForScope(connection.scope);
            storage.setTableStarred(table.connectionId, table.name, true);
            await connectionManager.saveStarredTablesForScope(connection.scope);
            treeProvider.fireTreeDataChange();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.unstarTable', async (item: TableTreeItem) => {
            const table = item?.table;
            if (!table) return;

            const connection = connectionManager.getConnection(table.connectionId);
            if (!connection) return;

            const storage = connectionManager.getStorageForScope(connection.scope);
            storage.setTableStarred(table.connectionId, table.name, false);
            await connectionManager.saveStarredTablesForScope(connection.scope);
            treeProvider.fireTreeDataChange();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.viewTableData', async (item: TableTreeItem) => {
            const table = item?.table;
            if (!table) {
                vscode.window.showErrorMessage('Please select a table to view data.');
                return;
            }

            const connection = connectionManager.getConnection(table.connectionId);
            if (!connection) {
                vscode.window.showErrorMessage('Connection not found.');
                return;
            }

            TableDataPanel.showTableData(
                connection,
                table,
                async (sort?: SortOptions) => {
                    const configWithPassword = await connectionManager.getConnectionWithPassword(table.connectionId);
                    if (!configWithPassword) {
                        throw new Error('Connection not found');
                    }
                    const provider = getSchemaProvider(connection.type);
                    return provider.queryTableData(connectionPool, configWithPassword, table.name, 100, sort);
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.setActiveConnection', (item: ConnectionTreeItem) => {
            const connection = item?.connection;
            if (!connection) {
                vscode.window.showErrorMessage('Please select a connection to set as active.');
                return;
            }
            connectionManager.setActiveConnection(connection.id);
        })
    );

    return treeProvider;
}
