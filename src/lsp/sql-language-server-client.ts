import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { ConnectionManager } from '../connections/connection-manager';
import { ConnectionPool } from '../connections/connection-pool';
import { ConnectionId } from '../models/connection';
import { SchemaCache } from './schema-cache';
import { splitSqlStatements, findStatementAtLine, SqlStatement } from '../sql/sql-statement-splitter';
import { log, logError } from '../logger';

/**
 * SQL Language Server client for SQL completions and hover.
 *
 * Uses sql-language-server (npm package) with cached schema for instant completions.
 *
 * Strategy:
 * 1. On connection activation, check for cached schema
 * 2. If cached: start LSP with JSON adapter (instant), refresh schema in background
 * 3. If not cached: fetch schema first (blocking), then start LSP
 * 4. When background refresh completes, restart LSP with new schema
 */
export class SqlLanguageServerClient implements vscode.Disposable {
    private client: LanguageClient | null = null;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;
    private currentConnectionId: ConnectionId | null = null;
    private schemaCache: SchemaCache;
    private lastStatementIndex: number = -1;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool
    ) {
        this.outputChannel = vscode.window.createOutputChannel('SQL Language Server');
        this.disposables.push(this.outputChannel);
        this.schemaCache = new SchemaCache();
    }

    /**
     * Initializes the client and subscribes to connection changes.
     * Server will start automatically when a connection becomes active.
     */
    initialize(): void {
        // Subscribe to connection changes
        this.disposables.push(
            this.connectionManager.onDidChangeActiveConnection((connectionId) => {
                this.onConnectionChange(connectionId);
            })
        );

        // Track cursor changes to re-sync when moving between statements
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.textEditor.document.languageId === 'sql') {
                    this.onCursorChange(e.textEditor);
                }
            })
        );

        // If there's already an active connection, start now
        const activeId = this.connectionManager.getActiveConnectionId();
        if (activeId) {
            this.onConnectionChange(activeId);
        } else {
            log('SQL Language Server: Waiting for database connection to start');
        }
    }

    /**
     * Handles cursor position changes - re-syncs document if cursor moves to different statement.
     */
    private onCursorChange(editor: vscode.TextEditor): void {
        if (!this.client) return;

        const text = editor.document.getText();
        const cursorLine = editor.selection.active.line;
        const statements = splitSqlStatements(text);

        const currentIdx = statements.findIndex(
            stmt => cursorLine >= stmt.startLine && cursorLine <= stmt.endLine
        );

        if (currentIdx !== this.lastStatementIndex && currentIdx !== -1) {
            this.lastStatementIndex = currentIdx;
            // Trigger a document change to re-sync with the new statement
            // This is done by sending a didChange notification with the current content
            log(`SQL Language Server: Cursor moved to statement ${currentIdx + 1}/${statements.length}`);
        }
    }

    /**
     * Handles connection activation/deactivation.
     * Restarts server when connection changes.
     */
    private async onConnectionChange(connectionId: ConnectionId | null): Promise<void> {
        if (connectionId) {
            // Connection activated or changed - restart server with new config
            await this.stop();
            await this.startWithCachedSchema(connectionId);
        } else {
            // No active connection - stop server
            await this.stop();
        }
    }

    /**
     * Starts the LSP using cached schema if available, otherwise fetches first.
     */
    private async startWithCachedSchema(connectionId: ConnectionId): Promise<void> {
        const config = await this.connectionManager.getConnectionWithPassword(connectionId);
        if (!config) {
            logError(`SQL Language Server: Connection ${connectionId} not found`);
            return;
        }

        // Check for cached schema
        if (this.schemaCache.hasCachedSchema(connectionId)) {
            const schemaPath = this.schemaCache.getSchemaFilePath(connectionId);
            const meta = this.schemaCache.getCacheMetadata(connectionId);
            log(`SQL Language Server: Using cached schema (${meta?.tableCount} tables from ${meta?.cachedAt})`);

            // Start with cached schema immediately
            await this.startWithJsonAdapter(connectionId, schemaPath);

            // Refresh schema in background, restart LSP when done
            this.refreshAndRestart(connectionId, config);
        } else {
            // No cache - must fetch schema first (blocking)
            log(`SQL Language Server: No cached schema, fetching...`);

            try {
                const schemaPath = await this.schemaCache.refreshSchema(
                    connectionId,
                    config,
                    this.connectionPool
                );
                await this.startWithJsonAdapter(connectionId, schemaPath);
            } catch (error) {
                logError('SQL Language Server: Failed to fetch schema', error);
                // Fall back to database adapter (slow but works)
                await this.startWithDatabaseAdapter(connectionId, config);
            }
        }
    }

    /**
     * Refreshes schema in background and restarts LSP when complete.
     */
    private async refreshAndRestart(
        connectionId: ConnectionId,
        config: Awaited<ReturnType<typeof this.connectionManager.getConnectionWithPassword>>
    ): Promise<void> {
        if (!config) return;

        try {
            const newSchemaPath = await this.schemaCache.refreshSchema(
                connectionId,
                config,
                this.connectionPool
            );

            // Only restart if this is still the active connection
            if (this.currentConnectionId === connectionId) {
                log('SQL Language Server: Restarting with refreshed schema');
                await this.stop();
                await this.startWithJsonAdapter(connectionId, newSchemaPath);
            }
        } catch (error) {
            logError('SQL Language Server: Background refresh failed', error);
            // Keep using cached version
        }
    }

    /**
     * Starts the SQL language server with JSON adapter (cached schema file).
     */
    private async startWithJsonAdapter(connectionId: ConnectionId, schemaFilePath: string): Promise<void> {
        const serverModule = this.getServerModule();
        if (!serverModule) return;

        const serverOptions: ServerOptions = {
            run: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ['true']
            },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ['true'],
                options: { execArgv: ['--nolazy', '--inspect=6009'] }
            }
        };

        // JSON adapter config - loads schema from file instantly
        const jsonConfig = {
            connections: [{
                name: 'cached-schema',
                adapter: 'json',
                filename: schemaFilePath
            }]
        };

        const clientOptions = this.buildClientOptions(jsonConfig);

        this.client = new LanguageClient(
            'sql-language-server',
            'SQL Language Server',
            serverOptions,
            clientOptions
        );

        this.currentConnectionId = connectionId;
        this.setupNotificationHandlers();

        try {
            await this.client.start();
            log(`SQL Language Server: Started with JSON adapter (${schemaFilePath})`);

            // Send full configuration (including lint rules) to trigger server setup
            this.client.sendNotification('workspace/didChangeConfiguration', {
                settings: { sqlLanguageServer: this.buildFullConfig(jsonConfig) }
            });
        } catch (error) {
            logError('SQL Language Server: Failed to start', error);
            this.client = null;
            this.currentConnectionId = null;
        }
    }

    /**
     * Starts the SQL language server with database adapter (direct connection).
     * Used as fallback when no cached schema is available.
     */
    private async startWithDatabaseAdapter(
        connectionId: ConnectionId,
        config: Awaited<ReturnType<typeof this.connectionManager.getConnectionWithPassword>>
    ): Promise<void> {
        if (!config) return;

        const serverModule = this.getServerModule();
        if (!serverModule) return;

        const serverOptions: ServerOptions = {
            run: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ['true']
            },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ['true'],
                options: { execArgv: ['--nolazy', '--inspect=6009'] }
            }
        };

        // Database adapter config - connects to live database
        const adapterMap: Record<string, string> = {
            'mysql': 'mysql',
            'postgres': 'postgres',
            'postgresql': 'postgres',
            'sqlite': 'sqlite3',
            'sqlite3': 'sqlite3'
        };
        const adapter = adapterMap[config.type] || config.type;

        const dbConfig = adapter === 'sqlite3'
            ? {
                connections: [{
                    name: config.name,
                    adapter: 'sqlite3',
                    filename: config.database,
                    database: config.database
                }]
            }
            : {
                connections: [{
                    name: config.name,
                    adapter,
                    host: config.host,
                    port: config.port,
                    user: config.username,
                    password: config.password,
                    database: config.database
                }]
            };

        const clientOptions = this.buildClientOptions(dbConfig);

        this.client = new LanguageClient(
            'sql-language-server',
            'SQL Language Server',
            serverOptions,
            clientOptions
        );

        this.currentConnectionId = connectionId;
        this.setupNotificationHandlers();

        try {
            await this.client.start();
            log(`SQL Language Server: Started with ${adapter} adapter`);

            // Send full configuration (including lint rules) to trigger server setup
            this.client.sendNotification('workspace/didChangeConfiguration', {
                settings: { sqlLanguageServer: this.buildFullConfig(dbConfig) }
            });
        } catch (error) {
            logError('SQL Language Server: Failed to start', error);
            this.client = null;
            this.currentConnectionId = null;
        }
    }

    /**
     * Resolves the server module path.
     */
    private getServerModule(): string | null {
        try {
            return require.resolve('sql-language-server/dist/vscodeExtensionServer.js');
        } catch {
            logError('SQL Language Server: Package not found. Run npm install.');
            return null;
        }
    }

    /**
     * Lint rules configuration - set to warning severity so they show as yellow squigglies.
     * Note: sql-language-server expects 'warning' not 'warn'
     *
     * Disabled rules (conflict with sql-formatter's indentation style):
     * - align-column-to-the-first: expects single-space indent
     * - align-where-clause-to-the-first: same alignment conflict
     * - linebreak-after-clause-keyword: sql-formatter handles this differently
     */
    private readonly lintConfig = {
        rules: {
            'align-column-to-the-first': 'off',
            'align-where-clause-to-the-first': 'off',
            'linebreak-after-clause-keyword': 'off',
            'column-new-line': 'warning',
            'reserved-word-case': ['warning', 'upper'],
            'space-surrounding-operators': 'warning',
            'where-clause-new-line': 'warning',
            'require-as-to-rename-column': 'warning'
        }
    };

    /**
     * Builds full config with connections and lint rules.
     */
    private buildFullConfig(config: { connections: unknown[] }) {
        return {
            ...config,
            lint: this.lintConfig
        };
    }

    /**
     * Builds LanguageClientOptions with middleware to inject config and filter content.
     */
    private buildClientOptions(config: { connections: unknown[] }): LanguageClientOptions {
        const fullConfig = this.buildFullConfig(config);

        return {
            documentSelector: [
                { scheme: 'file', language: 'sql' },
                { scheme: 'untitled', language: 'sql' }
            ],
            outputChannel: this.outputChannel,
            synchronize: {
                configurationSection: 'sqlLanguageServer'
            },
            middleware: {
                // Filter diagnostics to only show for current/adjacent statements
                handleDiagnostics: (uri, diagnostics, next) => {
                    const filtered = this.filterDiagnosticsByStatement(uri, diagnostics);
                    next(uri, filtered);
                },
                // Intercept didOpen to send only current statement
                didOpen: async (document, next) => {
                    const modified = this.getStatementOnlyDocument(document);
                    return next(modified);
                },
                // Intercept didChange to send only current statement
                didChange: async (event, next) => {
                    const modified = {
                        ...event,
                        document: this.getStatementOnlyDocument(event.document)
                    };
                    return next(modified);
                },
                workspace: {
                    configuration: async (params, token, next) => {
                        log(`SQL Language Server: Config request for sections: ${params.items.map(i => i.section).join(', ')}`);
                        const result = await next(params, token);
                        if (Array.isArray(result)) {
                            return result.map((item, index) => {
                                const section = params.items[index]?.section;
                                if (section === 'sqlLanguageServer') {
                                    log(`SQL Language Server: Injecting config`);
                                    return fullConfig;
                                }
                                return item;
                            });
                        }
                        return result;
                    }
                }
            }
        };
    }

    /**
     * Creates a modified document view that only contains the current statement.
     * This prevents the LSP from seeing multiple statements separated by \n\n.
     */
    private getStatementOnlyDocument(document: vscode.TextDocument): vscode.TextDocument {
        const editor = vscode.window.activeTextEditor;
        const cursorLine = editor?.document.uri.toString() === document.uri.toString()
            ? editor.selection.active.line
            : 0;

        const text = document.getText();
        const statements = splitSqlStatements(text);

        if (statements.length <= 1) {
            return document; // Single statement, no modification needed
        }

        const currentStmt = findStatementAtLine(statements, cursorLine);
        if (!currentStmt) {
            return document; // Cursor not in any statement
        }

        // Create a proxy document that returns only the current statement
        // but maintains line positions by padding with empty lines
        const paddedText = this.createPaddedStatementText(currentStmt, document.lineCount);

        return {
            ...document,
            getText: (range?: vscode.Range) => {
                if (range) {
                    // For range requests, check if it's within the statement
                    const startLine = range.start.line;
                    const endLine = range.end.line;
                    if (startLine >= currentStmt.startLine && endLine <= currentStmt.endLine) {
                        return document.getText(range);
                    }
                    return '';
                }
                return paddedText;
            },
            lineAt: (lineOrPosition: number | vscode.Position) => {
                const lineNum = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
                if (lineNum >= currentStmt.startLine && lineNum <= currentStmt.endLine) {
                    return document.lineAt(lineNum);
                }
                // Return empty line for lines outside current statement
                return {
                    lineNumber: lineNum,
                    text: '',
                    range: new vscode.Range(lineNum, 0, lineNum, 0),
                    rangeIncludingLineBreak: new vscode.Range(lineNum, 0, lineNum + 1, 0),
                    firstNonWhitespaceCharacterIndex: 0,
                    isEmptyOrWhitespace: true
                };
            }
        } as vscode.TextDocument;
    }

    /**
     * Creates text with empty lines padding to preserve line numbers,
     * with only the current statement's content.
     */
    private createPaddedStatementText(stmt: SqlStatement, totalLines: number): string {
        const lines: string[] = [];

        // Add empty lines before statement
        for (let i = 0; i < stmt.startLine; i++) {
            lines.push('');
        }

        // Add statement lines
        const stmtLines = stmt.text.split('\n');
        lines.push(...stmtLines);

        // Add empty lines after statement
        for (let i = stmt.endLine + 1; i < totalLines; i++) {
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Filters diagnostics to only include those in the current, previous, or next statement
     * relative to the cursor position.
     */
    private filterDiagnosticsByStatement(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== uri.toString()) {
            return diagnostics; // No active editor or different file, show all
        }

        const text = editor.document.getText();
        const cursorLine = editor.selection.active.line;
        const statements = splitSqlStatements(text);

        if (statements.length <= 1) {
            return diagnostics; // Single statement, show all
        }

        // Find current statement index
        const currentIdx = statements.findIndex(
            stmt => cursorLine >= stmt.startLine && cursorLine <= stmt.endLine
        );

        if (currentIdx === -1) {
            return diagnostics; // Cursor not in any statement
        }

        // Get valid line ranges (current, previous, next statements)
        const validStatements: SqlStatement[] = [];
        if (currentIdx > 0) validStatements.push(statements[currentIdx - 1]);
        validStatements.push(statements[currentIdx]);
        if (currentIdx < statements.length - 1) validStatements.push(statements[currentIdx + 1]);

        // Filter diagnostics to only those in valid statements
        return diagnostics.filter(diag => {
            const diagLine = diag.range.start.line;
            return validStatements.some(
                stmt => diagLine >= stmt.startLine && diagLine <= stmt.endLine
            );
        });
    }

    /**
     * Sets up notification handlers for server events.
     */
    private setupNotificationHandlers(): void {
        if (!this.client) return;

        this.client.onNotification('sqlLanguageServer.error', (params: { message: string }) => {
            logError(`SQL Language Server error: ${params.message}`);
        });
        this.client.onNotification('sqlLanguageServer.finishSetup', (params: unknown) => {
            log(`SQL Language Server: Setup finished - ${JSON.stringify(params)}`);
        });
    }

    /**
     * Stops the SQL language server.
     */
    private async stop(): Promise<void> {
        if (this.client) {
            try {
                await this.client.stop();
            } catch (error) {
                logError('SQL Language Server: Error stopping', error);
            }
            this.client = null;
            log('SQL Language Server: Stopped');
        }
    }

    /**
     * Manually triggers a schema refresh for the current connection.
     */
    async refreshCurrentSchema(): Promise<void> {
        if (!this.currentConnectionId) {
            log('SQL Language Server: No active connection to refresh');
            return;
        }

        const config = await this.connectionManager.getConnectionWithPassword(this.currentConnectionId);
        if (!config) return;

        log('SQL Language Server: Manual schema refresh requested');
        await this.refreshAndRestart(this.currentConnectionId, config);
    }

    dispose(): void {
        this.stop();
        this.disposables.forEach(d => d.dispose());
    }
}
