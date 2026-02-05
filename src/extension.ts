import * as vscode from 'vscode';
import { ConnectionStorage } from './connections/connection-storage';
import { ConnectionManager } from './connections/connection-manager';
import { ConnectionPool } from './connections/connection-pool';
import { registerConnectionCommands, setTreeProvider, setExtensionUri } from './connections/connection-commands';
import { registerTreeView } from './connections/connection-tree-provider';
import { ScriptStorage } from './scripts/script-storage';
import { registerScriptTreeView } from './scripts/script-tree-provider';
import { registerScriptCommands } from './scripts/script-commands';
import { SqlExecutor, getSqlFromEditor } from './sql/sql-executor';
import { SqlCodeLensProvider } from './sql/sql-codelens-provider';
import { TableDataPanel } from './views/table-data-panel';
import { SchemaCache } from './schema/schema-cache';
import { SqlCompletionProvider } from './completion/sql-completion-provider';
import { initLogger, log } from './logger';

let connectionManager: ConnectionManager;
let connectionPool: ConnectionPool;
let sqlExecutor: SqlExecutor;
let schemaCache: SchemaCache;

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = initLogger();
    context.subscriptions.push(outputChannel);

    log('dbooly extension activated');

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

    // Initialize Schema Cache and Completion Provider for SQL files
    schemaCache = new SchemaCache(connectionManager, connectionPool, context.globalStorageUri);
    const completionProvider = new SqlCompletionProvider(schemaCache, connectionManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'sql' },
            completionProvider,
            '.' // Trigger character for dot notation (table.column)
        ),
        schemaCache
    );

    // Register command to refresh schema cache
    context.subscriptions.push(
        vscode.commands.registerCommand('dbooly.refreshSchemaCache', async () => {
            await schemaCache.refresh();
            vscode.window.showInformationMessage('Schema cache refreshed');
        })
    );

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
