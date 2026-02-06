import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connection-manager';
import { ConnectionPool } from '../connections/connection-pool';
import { getSchemaProvider } from '../providers/schema-provider';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { log, logError } from '../logger';

interface SchemaInfo {
    tables: Map<string, TableInfo>;
    columns: Map<string, Map<string, ColumnInfo>>; // tableName -> columnName -> ColumnInfo
}

/**
 * Provides SQL diagnostics (squiggly lines) for:
 * - Unknown table names
 * - Unknown column names
 * - Basic syntax errors
 */
export class SqlDiagnosticsProvider implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];
    private schema: SchemaInfo | null = null;
    private schemaConnectionId: string | null = null;
    private pendingUpdates = new Map<string, NodeJS.Timeout>();
    private readonly debounceMs = 150;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('dbooly-sql');
        this.disposables.push(this.diagnosticCollection);

        // Update diagnostics when document changes (debounced)
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.languageId === 'sql') {
                    this.debouncedUpdate(e.document);
                }
            })
        );

        // Update diagnostics when opening SQL file
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (doc.languageId === 'sql') {
                    this.updateDiagnostics(doc);
                }
            })
        );

        // Clear diagnostics when closing document
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.cancelPendingUpdate(doc.uri.toString());
                this.diagnosticCollection.delete(doc.uri);
            })
        );

        // Immediate update on save
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.languageId === 'sql') {
                    this.cancelPendingUpdate(doc.uri.toString());
                    this.updateDiagnostics(doc);
                }
            })
        );

        // Refresh schema when connection changes
        this.disposables.push(
            connectionManager.onDidChangeActiveConnection(() => {
                this.schema = null;
                this.schemaConnectionId = null;
                // Re-validate all open SQL documents
                for (const doc of vscode.workspace.textDocuments) {
                    if (doc.languageId === 'sql') {
                        this.updateDiagnostics(doc);
                    }
                }
            })
        );

        // Initial validation of open SQL documents
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'sql') {
                this.updateDiagnostics(doc);
            }
        }
    }

    private debouncedUpdate(document: vscode.TextDocument): void {
        const uri = document.uri;
        const key = uri.toString();
        this.cancelPendingUpdate(key);

        const timeout = setTimeout(() => {
            this.pendingUpdates.delete(key);
            // Re-get the document to ensure we have the latest content
            const currentDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === key);
            if (currentDoc) {
                this.updateDiagnostics(currentDoc);
            }
        }, this.debounceMs);

        this.pendingUpdates.set(key, timeout);
    }

    private cancelPendingUpdate(key: string): void {
        const existing = this.pendingUpdates.get(key);
        if (existing) {
            clearTimeout(existing);
            this.pendingUpdates.delete(key);
        }
    }

    private async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Load schema if needed
        await this.ensureSchema();

        // Parse and validate
        const syntaxErrors = this.checkSyntax(text, document);
        diagnostics.push(...syntaxErrors);

        if (this.schema) {
            const schemaErrors = this.checkSchema(text, document);
            diagnostics.push(...schemaErrors);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private async ensureSchema(): Promise<void> {
        const activeId = this.connectionManager.getActiveConnectionId();

        if (!activeId) {
            this.schema = null;
            this.schemaConnectionId = null;
            return;
        }

        // Already have schema for this connection
        if (this.schemaConnectionId === activeId && this.schema) {
            return;
        }

        try {
            const conn = await this.connectionManager.getConnectionWithPassword(activeId);
            if (!conn) {
                return;
            }

            const provider = getSchemaProvider(conn.type);
            const tables = await provider.listTables(this.connectionPool, conn);

            const schemaInfo: SchemaInfo = {
                tables: new Map(),
                columns: new Map()
            };

            for (const table of tables) {
                schemaInfo.tables.set(table.name.toLowerCase(), table);

                try {
                    const columns = await provider.listColumns(this.connectionPool, conn, table.name);
                    const columnMap = new Map<string, ColumnInfo>();
                    for (const col of columns) {
                        columnMap.set(col.name.toLowerCase(), col);
                    }
                    schemaInfo.columns.set(table.name.toLowerCase(), columnMap);
                } catch (error) {
                    // Continue with other tables
                }
            }

            this.schema = schemaInfo;
            this.schemaConnectionId = activeId;
            log(`SqlDiagnostics: Loaded schema with ${tables.length} tables`);
        } catch (error) {
            logError('SqlDiagnostics: Failed to load schema', error);
        }
    }

    /**
     * Check for basic syntax errors
     */
    private checkSyntax(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        // Check for unmatched parentheses
        let parenDepth = 0;
        const parenPositions: number[] = [];
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(') {
                parenDepth++;
                parenPositions.push(i);
            } else if (text[i] === ')') {
                parenDepth--;
                if (parenDepth < 0) {
                    const pos = document.positionAt(i);
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(pos, pos.translate(0, 1)),
                        'Unmatched closing parenthesis',
                        vscode.DiagnosticSeverity.Error
                    ));
                    parenDepth = 0;
                } else {
                    parenPositions.pop();
                }
            }
        }
        // Report unclosed parentheses
        for (const pos of parenPositions) {
            const docPos = document.positionAt(pos);
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(docPos, docPos.translate(0, 1)),
                'Unclosed parenthesis',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for unclosed quotes
        const quoteCheck = this.checkUnclosedQuotes(text, document);
        diagnostics.push(...quoteCheck);

        // Check for trailing comma before FROM/WHERE/etc.
        const trailingCommaRegex = /,\s*\n?\s*(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|EXCEPT|INTERSECT|;|\))/gi;
        let match;
        while ((match = trailingCommaRegex.exec(text)) !== null) {
            const commaPos = match.index;
            const pos = document.positionAt(commaPos);
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(pos, pos.translate(0, 1)),
                `Trailing comma before ${match[1]}`,
                vscode.DiagnosticSeverity.Error
            ));
        }

        return diagnostics;
    }

    private checkUnclosedQuotes(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let quoteStart = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const prev = i > 0 ? text[i - 1] : '';

            // Skip escaped quotes
            if (prev === '\\') continue;

            if (char === "'" && !inDoubleQuote) {
                if (inSingleQuote) {
                    inSingleQuote = false;
                } else {
                    inSingleQuote = true;
                    quoteStart = i;
                }
            } else if (char === '"' && !inSingleQuote) {
                if (inDoubleQuote) {
                    inDoubleQuote = false;
                } else {
                    inDoubleQuote = true;
                    quoteStart = i;
                }
            }
        }

        if (inSingleQuote || inDoubleQuote) {
            const pos = document.positionAt(quoteStart);
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(pos, pos.translate(0, 1)),
                'Unclosed string literal',
                vscode.DiagnosticSeverity.Error
            ));
        }

        return diagnostics;
    }

    /**
     * Check for schema errors (unknown tables/columns)
     */
    private checkSchema(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        if (!this.schema) return diagnostics;

        // Extract table references from FROM and JOIN clauses
        const tableRefs = this.extractTableReferences(text);
        const tableAliases = new Map<string, string>(); // alias -> tableName

        for (const ref of tableRefs) {
            const tableLower = ref.table.toLowerCase();

            if (!this.schema.tables.has(tableLower)) {
                // Find position in document
                const regex = new RegExp(`\\b${this.escapeRegex(ref.table)}\\b`, 'gi');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const pos = document.positionAt(match.index);
                    const endPos = document.positionAt(match.index + ref.table.length);
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(pos, endPos),
                        `Unknown table: ${ref.table}`,
                        vscode.DiagnosticSeverity.Warning
                    ));
                    break; // Only report first occurrence
                }
            } else if (ref.alias) {
                tableAliases.set(ref.alias.toLowerCase(), tableLower);
            }
        }

        // Check column references (table.column or just column if tables are known)
        const columnRefs = this.extractColumnReferences(text);
        for (const ref of columnRefs) {
            if (ref.table) {
                // Qualified column reference (table.column)
                let tableName = ref.table.toLowerCase();

                // Resolve alias
                if (tableAliases.has(tableName)) {
                    tableName = tableAliases.get(tableName)!;
                }

                const tableColumns = this.schema.columns.get(tableName);
                if (tableColumns && !tableColumns.has(ref.column.toLowerCase())) {
                    const regex = new RegExp(`\\b${this.escapeRegex(ref.table)}\\.${this.escapeRegex(ref.column)}\\b`, 'gi');
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        const colStart = match.index + ref.table.length + 1;
                        const pos = document.positionAt(colStart);
                        const endPos = document.positionAt(colStart + ref.column.length);
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(pos, endPos),
                            `Unknown column: ${ref.column} in table ${ref.table}`,
                            vscode.DiagnosticSeverity.Warning
                        ));
                        break;
                    }
                }
            }
        }

        return diagnostics;
    }

    private extractTableReferences(text: string): Array<{ table: string; alias?: string }> {
        const refs: Array<{ table: string; alias?: string }> = [];

        // Match FROM table [AS] alias and JOIN table [AS] alias
        const regex = /(?:FROM|JOIN)\s+(`?\w+`?)(?:\s+(?:AS\s+)?(`?\w+`?))?/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const table = match[1].replace(/`/g, '');
            const alias = match[2]?.replace(/`/g, '');

            // Skip if alias looks like a keyword
            const keywords = ['WHERE', 'ON', 'AND', 'OR', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'JOIN', 'SET', 'ORDER', 'GROUP', 'HAVING', 'LIMIT'];
            if (alias && keywords.includes(alias.toUpperCase())) {
                refs.push({ table });
            } else {
                refs.push({ table, alias });
            }
        }

        // Match UPDATE table and INSERT INTO table
        const updateRegex = /(?:UPDATE|INSERT\s+INTO)\s+(`?\w+`?)/gi;
        while ((match = updateRegex.exec(text)) !== null) {
            refs.push({ table: match[1].replace(/`/g, '') });
        }

        return refs;
    }

    private extractColumnReferences(text: string): Array<{ table?: string; column: string }> {
        const refs: Array<{ table?: string; column: string }> = [];

        // Match table.column references
        const regex = /(`?\w+`?)\.(`?\w+`?)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const table = match[1].replace(/`/g, '');
            const column = match[2].replace(/`/g, '');

            // Skip if looks like a function or keyword
            if (column !== '*') {
                refs.push({ table, column });
            }
        }

        return refs;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    dispose(): void {
        // Clear all pending updates
        for (const timeout of this.pendingUpdates.values()) {
            clearTimeout(timeout);
        }
        this.pendingUpdates.clear();
        this.disposables.forEach(d => d.dispose());
    }
}
