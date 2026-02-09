import * as vscode from 'vscode';
import { ConnectionStorage } from './connections/connection-storage';
import { ConnectionManager } from './connections/connection-manager';
import { ConnectionPool, setSqlJsWasmPath } from './connections/connection-pool';
import { registerConnectionCommands, setTreeProvider, setExtensionUri } from './connections/connection-commands';
import { registerTreeView } from './connections/connection-tree-provider';
import { ScriptStorage } from './scripts/script-storage';
import { registerScriptTreeView } from './scripts/script-tree-provider';
import { registerScriptCommands } from './scripts/script-commands';
import { SqlExecutor, getSqlFromEditor } from './sql/sql-executor';
import { SqlCodeLensProvider } from './sql/sql-codelens-provider';
import { TableDataPanel } from './views/table-data-panel';
import { SqlLanguageServerClient } from './lsp/sql-language-server-client';
import { SqlDiagnosticsProvider } from './diagnostics/sql-diagnostics-provider';
import { SqlFormatter } from './sql/sql-formatter';
import { initLogger, log } from './logger';

let connectionManager: ConnectionManager;
let connectionPool: ConnectionPool;
let sqlExecutor: SqlExecutor;
let sqlLanguageServerClient: SqlLanguageServerClient;

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = initLogger();
    context.subscriptions.push(outputChannel);

    log('dbooly extension activated');

    // Initialize sql.js WASM path for SQLite support
    setSqlJsWasmPath(context.extensionPath);

    const storage = new ConnectionStorage(context.secrets);
    connectionManager = new ConnectionManager(storage);
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

    // Initialize SQL Executor with callbacks for results panel
    sqlExecutor = new SqlExecutor(
        connectionManager,
        connectionPool,
        (result) => {
            const panel = TableDataPanel.showQueryResults();
            panel.showResult(result);
        },
        (error) => {
            const panel = TableDataPanel.showQueryResults();
            panel.showError(error);
        },
        (connectionName) => {
            const panel = TableDataPanel.showQueryResults();
            panel.showExecuting(connectionName);
        },
        () => {
            const panel = TableDataPanel.showQueryResults();
            panel.showCancelled();
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

            const sql = getSqlFromEditor(editor);
            if (!sql) {
                vscode.window.showWarningMessage('No SQL statement at cursor');
                return;
            }
            sqlExecutor.execute(sql);
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
