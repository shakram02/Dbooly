import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connection-manager';
import { splitSqlStatements } from '../sql/sql-statement-splitter';

export class SqlCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly connectionManager: ConnectionManager) {
        // Refresh CodeLens when active connection changes
        this.disposables.push(
            connectionManager.onDidChangeActiveConnection(() => {
                this._onDidChangeCodeLenses.fire();
            })
        );
    }

    dispose(): void {
        this._onDidChangeCodeLenses.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Find SQL statement boundaries using shared splitter
        const statements = splitSqlStatements(text);

        // Get active connection name for display
        const activeId = this.connectionManager.getActiveConnectionId();
        const activeConnection = activeId ? this.connectionManager.getConnection(activeId) : null;
        const connectionLabel = activeConnection
            ? `on ${activeConnection.name}`
            : '(no connection)';

        for (const stmt of statements) {
            const range = new vscode.Range(
                stmt.startLine, 0,
                stmt.endLine, document.lineAt(stmt.endLine).text.length
            );
            const lens = new vscode.CodeLens(range, {
                title: `▶ Execute ${connectionLabel}`,
                command: 'dbooly.executeSqlAtCursor',
                arguments: [range],
            });
            lenses.push(lens);
        }

        return lenses;
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
