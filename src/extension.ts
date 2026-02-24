import * as vscode from 'vscode';
import { ConnectionStorage } from './connections/connection-storage';
import { GlobalConnectionStorage } from './connections/global-connection-storage';
import { ConnectionManager } from './connections/connection-manager';
import { ConnectionPool, setSqlJsWasmPath } from './connections/connection-pool';
import { registerConnectionCommands, setTreeProvider, setExtensionUri } from './connections/connection-commands';
import { registerTreeView } from './connections/connection-tree-provider';
import { ScriptStorage } from './scripts/script-storage';
import { registerScriptTreeView } from './scripts/script-tree-provider';
import { registerScriptCommands } from './scripts/script-commands';
import { SqlExecutor, getSqlFromEditor } from './sql/sql-executor';
import { SqlCodeLensProvider } from './sql/sql-codelens-provider';
import { TableDataPanel, buildEditabilityInfo, MutationCallbacks } from './views/table-data-panel';
import { InlineResultDecoration } from './views/inline-result-decoration';
import { detectSingleTable } from './sql/sql-table-detector';
import { getSchemaProvider } from './providers/schema-provider';
import { SqlLanguageServerClient } from './lsp/sql-language-server-client';
import { SqlDiagnosticsProvider } from './diagnostics/sql-diagnostics-provider';
import { SqlFormatter } from './sql/sql-formatter';
import { initLogger, log } from './logger';

let connectionManager: ConnectionManager;
let connectionPool: ConnectionPool;
let sqlExecutor: SqlExecutor;
let sqlLanguageServerClient: SqlLanguageServerClient;
let inlineDecoration: InlineResultDecoration;
let currentExecutionContext: { editor: vscode.TextEditor; endLine: number } | null = null;

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = initLogger();
    context.subscriptions.push(outputChannel);

    log('dbooly extension activated');

    // Initialize sql.js WASM path for SQLite support
    setSqlJsWasmPath(context.extensionPath);

    const projectStorage = new ConnectionStorage(context.secrets);
    const globalStorage = new GlobalConnectionStorage(context.globalStorageUri);
    connectionManager = new ConnectionManager(projectStorage, globalStorage);
    connectionPool = new ConnectionPool();

    await connectionManager.initialize();

    const treeProvider = registerTreeView(context, connectionManager, connectionPool);
    setTreeProvider(treeProvider);
    setExtensionUri(context.extensionUri);

    registerConnectionCommands(context, connectionManager);

    // Initialize Scripts sidebar
    const scriptStorage = new ScriptStorage(context.globalState, context.globalStorageUri);
    const scriptTreeProvider = registerScriptTreeView(context, scriptStorage);
    registerScriptCommands(context, scriptStorage, scriptTreeProvider);

    // Initialize inline result decoration for non-SELECT feedback
    inlineDecoration = new InlineResultDecoration();
    context.subscriptions.push(inlineDecoration);

    // Initialize SQL Executor with callbacks
    sqlExecutor = new SqlExecutor(
        connectionManager,
        connectionPool,
        async (result) => {
            if (result.type !== 'select' && currentExecutionContext) {
                inlineDecoration.showResult(result.type, result.affectedRows ?? 0, result.executionTimeMs);
            } else {
                inlineDecoration.clear();
                const panel = TableDataPanel.showQueryResults();

                // Query mode: detect single-table for editability
                let editabilityInfo;
                let mutationCallbacks: MutationCallbacks | undefined;
                if (result.type === 'select' && result.query) {
                    const tableName = detectSingleTable(result.query);
                    if (tableName) {
                        try {
                            const activeId = connectionManager.getActiveConnectionId();
                            const conn = activeId ? connectionManager.getConnection(activeId) : null;
                            const config = activeId ? await connectionManager.getConnectionWithPassword(activeId) : null;
                            if (conn && config) {
                                const provider = getSchemaProvider(conn.type);
                                const columns = await provider.listColumns(connectionPool, config, tableName);
                                editabilityInfo = buildEditabilityInfo(tableName, columns, 'TABLE', result.columns);
                                if (editabilityInfo.editable) {
                                    mutationCallbacks = {
                                        async updateCell(tbl, primaryKeys, columnName, newValue) {
                                            const cfg = await connectionManager.getConnectionWithPassword(activeId!);
                                            if (!cfg) { return { success: false, error: 'Connection not found' }; }
                                            return provider.updateCell(connectionPool, cfg, tbl, primaryKeys, columnName, newValue);
                                        },
                                        async insertRow(tbl, values) {
                                            const cfg = await connectionManager.getConnectionWithPassword(activeId!);
                                            if (!cfg) { return { success: false, error: 'Connection not found' }; }
                                            return provider.insertRow(connectionPool, cfg, tbl, values);
                                        },
                                        async deleteRow(tbl, primaryKeys) {
                                            const cfg = await connectionManager.getConnectionWithPassword(activeId!);
                                            if (!cfg) { return { success: false, error: 'Connection not found' }; }
                                            return provider.deleteRow(connectionPool, cfg, tbl, primaryKeys);
                                        },
                                    };
                                }
                            }
                        } catch {
                            // Failed to fetch metadata — proceed without editability
                        }
                    }
                }

                panel.showResult(result, editabilityInfo, mutationCallbacks);
            }
            currentExecutionContext = null;
        },
        (error) => {
            inlineDecoration.clear();
            const panel = TableDataPanel.showQueryResults();
            panel.showError(error);
            currentExecutionContext = null;
        },
        (connectionName) => {
            if (currentExecutionContext) {
                inlineDecoration.showExecuting(currentExecutionContext.editor, currentExecutionContext.endLine);
            } else {
                const panel = TableDataPanel.showQueryResults();
                panel.showExecuting(connectionName);
            }
        },
        () => {
            inlineDecoration.clear();
            currentExecutionContext = null;
        }
    );

    // Register Execute SQL command (Ctrl+Enter)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.executeSql', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const result = getSqlFromEditor(editor);
            if (!result) {
                vscode.window.showWarningMessage('No SQL statement at cursor');
                return;
            }
            currentExecutionContext = { editor, endLine: result.endLine };
            inlineDecoration.clear();
            sqlExecutor.execute(result.sql);
        })
    );

    // Register Cancel Query command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.cancelQuery', () => {
            sqlExecutor.cancel();
        })
    );

    // Register Execute SQL at cursor (for CodeLens)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.executeSqlAtCursor', (range: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const sql = editor.document.getText(range);
            currentExecutionContext = { editor, endLine: range.end.line };
            inlineDecoration.clear();
            sqlExecutor.execute(sql);
        })
    );

    // Register CodeLens provider for SQL files
    const codeLensProvider = new SqlCodeLensProvider(connectionManager);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'sql' },
            codeLensProvider
        ),
        codeLensProvider
    );

    // Initialize SQL language server for SQL completions and hover
    // Server starts lazily when a database connection is activated
    // Uses schema caching for instant completions
    sqlLanguageServerClient = new SqlLanguageServerClient(connectionManager, connectionPool);
    context.subscriptions.push(sqlLanguageServerClient);
    sqlLanguageServerClient.initialize();

    // Register SQL formatter as a VSCode formatting provider
    const sqlFormatter = new SqlFormatter(connectionManager);
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            { language: 'sql' },
            sqlFormatter
        )
    );

    // Also register manual format command for context menu
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.formatSql', () => {
            sqlFormatter.formatDocument();
        })
    );

    // Initialize SQL diagnostics provider for syntax and schema validation
    const diagnosticsProvider = new SqlDiagnosticsProvider(connectionManager, connectionPool);
    context.subscriptions.push(diagnosticsProvider);

    // Register pool, connection manager, and panel disposal for cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            TableDataPanel.dispose();
            connectionPool.dispose();
            connectionManager.dispose();
        },
    });
}

export function deactivate() {}
