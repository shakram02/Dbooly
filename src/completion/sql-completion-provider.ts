import * as vscode from 'vscode';
import { SchemaCache, CachedSchema } from '../schema/schema-cache';
import { ConnectionManager } from '../connections/connection-manager';
import { getSqlContext, getWordAtCursor } from './sql-parser';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { log } from '../logger';

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly schemaCache: SchemaCache,
        private readonly connectionManager: ConnectionManager
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
        // Check cache state first
        const state = this.schemaCache.getState();

        if (state.status === 'empty') {
            // No active connection - try to auto-activate if there's only one
            const connections = this.connectionManager.getAllConnections();
            if (connections.length === 1) {
                // Auto-activate the only connection
                log(`SqlCompletionProvider: Auto-activating single connection "${connections[0].name}"`);
                this.connectionManager.setActiveConnection(connections[0].id);
                // Return loading state - schema will be fetched
                return new vscode.CompletionList([
                    this.createLoadingItem()
                ], true);
            }
            // Multiple or no connections - show helpful message
            return [this.createNoConnectionItem(connections.length)];
        }

        if (state.status === 'error') {
            // Schema fetch failed - show error hint
            log(`SqlCompletionProvider: Schema error - ${state.error}`);
            return [this.createErrorItem(state.error)];
        }

        if (state.status === 'loading') {
            // Show loading indicator
            return new vscode.CompletionList([
                this.createLoadingItem()
            ], true); // isIncomplete = true to retry
        }

        // Get cached schema
        const schema = await this.schemaCache.getSchema();
        if (!schema) {
            return [this.createNoConnectionItem()];
        }

        // Get cursor offset
        const cursorOffset = document.offsetAt(position);
        const sql = document.getText();

        // Determine context
        const context = getSqlContext(sql, cursorOffset);
        log(`SqlCompletionProvider: Context = ${JSON.stringify(context)}`);

        // Get the word being typed for filtering
        const wordAtCursor = getWordAtCursor(sql, cursorOffset).toLowerCase();

        switch (context.type) {
            case 'tables':
                // After FROM/JOIN - show tables only
                return this.getTableCompletions(schema, wordAtCursor);

            case 'columns':
                if (context.tables && context.tables.length > 0) {
                    // Tables exist in query - show their columns
                    return this.getColumnCompletions(schema, context.tables, wordAtCursor);
                } else {
                    // No tables yet - show tables with "." suffix to trigger column selection
                    return this.getTableSelectCompletions(schema, wordAtCursor);
                }

            case 'qualified-columns':
                // After "table." - show columns for that table
                return this.getQualifiedColumnCompletions(schema, context.table, wordAtCursor);

            case 'unknown':
            default:
                // No context - show tables with "." suffix
                return this.getTableSelectCompletions(schema, wordAtCursor);
        }
    }

    private getTableCompletions(
        schema: CachedSchema,
        filter: string
    ): vscode.CompletionItem[] {
        const seen = new Set<string>();
        const items: vscode.CompletionItem[] = [];

        for (const table of schema.tables) {
            const key = table.name.toLowerCase();
            if (!seen.has(key) && key.includes(filter)) {
                seen.add(key);
                items.push(this.createTableItem(table));
            }
        }

        return items;
    }

    private getColumnCompletions(
        schema: CachedSchema,
        tables: string[] | undefined,
        filter: string
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>(); // Track "table.column" to prevent duplicates

        if (tables && tables.length > 0) {
            // Deduplicate table names
            const uniqueTables = [...new Set(tables.map(t => t.toLowerCase()))];

            // Show columns from specific tables
            for (const tableName of uniqueTables) {
                const columns = schema.columns.get(tableName);
                if (columns) {
                    for (const col of columns) {
                        const key = `${tableName}.${col.name.toLowerCase()}`;
                        if (!seen.has(key) && col.name.toLowerCase().includes(filter)) {
                            seen.add(key);
                            items.push(this.createColumnItem(col, tableName));
                        }
                    }
                }
            }
        } else {
            // Show columns from all tables
            for (const [tableName, columns] of schema.columns) {
                for (const col of columns) {
                    const key = `${tableName}.${col.name.toLowerCase()}`;
                    if (!seen.has(key) && col.name.toLowerCase().includes(filter)) {
                        seen.add(key);
                        items.push(this.createColumnItem(col, tableName));
                    }
                }
            }
        }

        return items;
    }

    private getQualifiedColumnCompletions(
        schema: CachedSchema,
        table: string,
        filter: string
    ): vscode.CompletionItem[] {
        const columns = schema.columns.get(table.toLowerCase());
        if (!columns) {
            return [];
        }

        return columns
            .filter(c => c.name.toLowerCase().includes(filter))
            .map(c => this.createColumnItem(c));
    }

    /**
     * Shows tables with "." suffix - when selected, inserts "table." and triggers column completion.
     * Used when no tables exist in the query yet.
     */
    private getTableSelectCompletions(
        schema: CachedSchema,
        filter: string
    ): vscode.CompletionItem[] {
        const seen = new Set<string>();
        const items: vscode.CompletionItem[] = [];

        for (const table of schema.tables) {
            const key = table.name.toLowerCase();
            if (!seen.has(key) && key.includes(filter)) {
                seen.add(key);
                items.push(this.createTableSelectItem(table));
            }
        }

        return items;
    }

    /**
     * Creates a table completion item that inserts "tablename." and triggers column suggestions.
     */
    private createTableSelectItem(table: TableInfo): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            table.name,
            vscode.CompletionItemKind.Module
        );

        item.detail = `${table.type} - select to see columns`;
        item.documentation = new vscode.MarkdownString(
            `**${table.type}**: \`${table.name}\`\n\n` +
            `Select to insert \`${table.name}.\` and see column suggestions.`
        );

        // Insert table name followed by "." to trigger column completion
        item.insertText = `${table.name}.`;

        // Trigger completion again after inserting
        item.command = {
            command: 'editor.action.triggerSuggest',
            title: 'Trigger column suggestions'
        };

        item.sortText = `0_${table.name}`;

        return item;
    }

    private getAllCompletions(
        schema: CachedSchema,
        filter: string
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const seenTables = new Set<string>();
        const seenColumns = new Set<string>();

        // Add tables
        for (const table of schema.tables) {
            const key = table.name.toLowerCase();
            if (!seenTables.has(key) && key.includes(filter)) {
                seenTables.add(key);
                items.push(this.createTableItem(table));
            }
        }

        // Add columns from all tables
        for (const [tableName, columns] of schema.columns) {
            for (const col of columns) {
                const key = `${tableName}.${col.name.toLowerCase()}`;
                if (!seenColumns.has(key) && col.name.toLowerCase().includes(filter)) {
                    seenColumns.add(key);
                    items.push(this.createColumnItem(col, tableName));
                }
            }
        }

        return items;
    }

    private createTableItem(table: TableInfo): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            table.name,
            vscode.CompletionItemKind.Module
        );

        item.detail = table.type;
        item.documentation = new vscode.MarkdownString(
            `**${table.type}**: \`${table.name}\``
        );

        // Sort tables before columns
        item.sortText = `0_${table.name}`;

        return item;
    }

    private createColumnItem(column: ColumnInfo, tableName?: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            column.name,
            vscode.CompletionItemKind.Field
        );

        // Build detail string
        let detail = column.dataType;
        if (column.keyType === 'PRIMARY') {
            detail += ' 🔑 PK';
        } else if (column.keyType === 'FOREIGN') {
            detail += ' 🔗 FK';
        }
        if (!column.nullable) {
            detail += ' NOT NULL';
        }

        item.detail = detail;

        // Build documentation
        const docParts: string[] = [];
        if (tableName) {
            docParts.push(`**Table**: \`${tableName}\``);
        }
        docParts.push(`**Type**: \`${column.dataType}\``);
        if (column.keyType === 'PRIMARY') {
            docParts.push('**Primary Key**');
        }
        if (column.keyType === 'FOREIGN' && column.foreignKeyRef) {
            docParts.push(`**References**: \`${column.foreignKeyRef.table}.${column.foreignKeyRef.column}\``);
        }
        if (column.defaultValue !== null) {
            docParts.push(`**Default**: \`${column.defaultValue}\``);
        }

        item.documentation = new vscode.MarkdownString(docParts.join('\n\n'));

        // Sort columns after tables, with table prefix
        item.sortText = tableName ? `1_${tableName}_${column.name}` : `1_${column.name}`;

        return item;
    }

    private createLoadingItem(): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            '$(sync~spin) Loading schema...',
            vscode.CompletionItemKind.Text
        );
        item.detail = 'Fetching tables and columns from database';
        item.insertText = '';
        item.sortText = '0';
        return item;
    }

    private createNoConnectionItem(connectionCount: number = 0): vscode.CompletionItem {
        if (connectionCount === 0) {
            // No connections configured at all
            const item = new vscode.CompletionItem(
                '$(database) Add a database connection',
                vscode.CompletionItemKind.Text
            );
            item.detail = 'No database connections configured';
            item.documentation = new vscode.MarkdownString(
                'To get table and column suggestions:\n\n' +
                '1. Open the **dbooly** sidebar\n' +
                '2. Click the **+** button to add a connection\n' +
                '3. Enter your database credentials\n\n' +
                'Once connected, suggestions will appear automatically!'
            );
            item.insertText = '';
            item.sortText = '0';
            item.command = {
                command: 'dbooly.connections.focus',
                title: 'Open Connections'
            };
            return item;
        }

        // Multiple connections - user needs to pick one
        const item = new vscode.CompletionItem(
            '$(database) Select a database connection',
            vscode.CompletionItemKind.Text
        );
        item.detail = `${connectionCount} connections available`;
        item.documentation = new vscode.MarkdownString(
            'To get table and column suggestions:\n\n' +
            '1. Open the **dbooly** sidebar\n' +
            '2. **Click on a connection** to activate it\n\n' +
            'The selected connection will be used for suggestions!'
        );
        item.insertText = '';
        item.sortText = '0';
        item.command = {
            command: 'dbooly.connections.focus',
            title: 'Open Connections'
        };
        return item;
    }

    private createErrorItem(error: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            '$(error) Schema load failed',
            vscode.CompletionItemKind.Text
        );
        item.detail = 'Could not fetch database schema';
        item.documentation = new vscode.MarkdownString(
            `**Error:** ${error}\n\n` +
            'Try:\n' +
            '- Check your database connection\n' +
            '- Run **dbooly: Refresh Schema Cache** command\n' +
            '- Reconnect to the database'
        );
        item.insertText = '';
        item.sortText = '0';
        return item;
    }
}
