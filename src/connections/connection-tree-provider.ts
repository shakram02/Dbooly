import * as vscode from 'vscode';
import { ConnectionManager } from './connection-manager';
import { ConnectionPool } from './connection-pool';
import { ConnectionConfig, ConnectionId } from '../models/connection';
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

export class ConnectionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly connection: ConnectionConfig,
        public readonly tablesLoaded: boolean = false,
        public readonly isActive: boolean = false,
    ) {
        super(connection.name, vscode.TreeItemCollapsibleState.Collapsed);

        this.tooltip = `${connection.username}@${connection.host}:${connection.port}/${connection.database}${isActive ? ' (Active)' : ''}`;
        this.description = connection.type;

        // Context value includes active state for context menu filtering
        if (isActive) {
            this.contextValue = tablesLoaded ? 'connection-loaded-active' : 'connection-active';
        } else {
            this.contextValue = tablesLoaded ? 'connection-loaded' : 'connection';
        }

        // Active connection: green badge overlay on database icon
        // Inactive connection: deemphasized (grayed out) styling
        if (isActive) {
            this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
        } else {
            this.iconPath = new vscode.ThemeIcon('database');
        }

        // Apply deemphasized foreground color to inactive connections
        if (!isActive) {
            // Note: VSCode TreeItem doesn't support direct label color changes
            // We rely on the icon color and description to convey inactive state
            // The grayed-out effect is achieved through the icon not having a highlight color
        }

        // ARIA label for accessibility
        this.accessibilityInformation = {
            label: `${connection.name} database connection${isActive ? ', active' : ''}`,
            role: 'treeitem',
        };
    }
}

export type TreeItem = ConnectionTreeItem | TableTreeItem | ColumnTreeItem | LoadingTreeItem | ErrorTreeItem | EmptyTreeItem;

export class ConnectionTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tableCache: Map<ConnectionId, TableInfo[]> = new Map();
    private columnCache = new LRUCache<string, ColumnInfo[]>(100, 10 * 60 * 1000); // 100 tables, 10 min TTL
    private disposables: vscode.Disposable[] = [];

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
        this._onDidChangeTreeData.fire();
    }

    refreshConnection(connectionId: ConnectionId): void {
        this.tableCache.delete(connectionId);
        this.columnCache.clearByPrefix(`${connectionId}:`);
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
            const connections = this.connectionManager.getAllConnections();
            const activeId = this.connectionManager.getActiveConnectionId();
            return connections.map(conn => new ConnectionTreeItem(
                conn,
                this.tableCache.has(conn.id),
                conn.id === activeId
            ));
        }

        if (element instanceof ConnectionTreeItem) {
            return this.getTablesForConnection(element.connection);
        }

        if (element instanceof TableTreeItem) {
            return this.getColumnsForTable(element.table);
        }

        return [];
    }

    private async getTablesForConnection(connection: ConnectionConfig): Promise<TableTreeItem[]> {
        const tables = await this.fetchTablesForConnection(connection.id);
        const starredSet = this.connectionManager.getStorage().getStarredTables(connection.id);
        const sorted = sortTablesStarredFirst(tables, starredSet);
        return sorted.map(t => new TableTreeItem(t, starredSet.has(t.name)));
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
            const configWithPassword = await this.connectionManager.getConnectionWithPassword(table.connectionId);
            if (!configWithPassword) {
                return [new ErrorTreeItem('Connection not found')];
            }

            const provider = getSchemaProvider(connection.type);
            const columns = await provider.listColumns(this.connectionPool, configWithPassword, table.name);

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
            // Even with cached data, activate the connection when expanding
            this.connectionManager.setActiveConnection(connectionId);
            return cached;
        }

        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        try {
            const configWithPassword = await this.connectionManager.getConnectionWithPassword(connectionId);
            if (!configWithPassword) {
                throw new Error('Connection not found');
            }

            const provider = getSchemaProvider(connection.type);
            const tables = await provider.listTables(this.connectionPool, configWithPassword);

            this.tableCache.set(connectionId, tables);

            // Auto-activate connection on successful expansion
            this.connectionManager.setActiveConnection(connectionId);

            // Refresh tree to update context value (enables search button)
            this._onDidChangeTreeData.fire();

            return tables;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
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

    // Auto-activate connection when selected (clicked) in tree view
    treeView.onDidChangeSelection((e) => {
        const selected = e.selection[0];
        if (selected instanceof ConnectionTreeItem && selected.connection) {
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

            const storage = connectionManager.getStorage();
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
                    await storage.saveConnections(connectionManager.getAllConnections());
                    treeProvider.fireTreeDataChange();
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.starTable', async (item: TableTreeItem) => {
            const table = item?.table;
            if (!table) return;

            const storage = connectionManager.getStorage();
            storage.setTableStarred(table.connectionId, table.name, true);
            await storage.saveConnections(connectionManager.getAllConnections());
            treeProvider.fireTreeDataChange();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.unstarTable', async (item: TableTreeItem) => {
            const table = item?.table;
            if (!table) return;

            const storage = connectionManager.getStorage();
            storage.setTableStarred(table.connectionId, table.name, false);
            await storage.saveConnections(connectionManager.getAllConnections());
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
