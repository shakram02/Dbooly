import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connection-manager';

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

        // Find SQL statement boundaries (semicolon-separated or whole document)
        const statements = this.findStatements(text, document);

        // Get active connection name for display
        const activeId = this.connectionManager.getActiveConnectionId();
        const activeConnection = activeId ? this.connectionManager.getConnection(activeId) : null;
        const connectionLabel = activeConnection
            ? `on ${activeConnection.name}`
            : '(no connection)';

        for (const stmt of statements) {
            const lens = new vscode.CodeLens(stmt.range, {
                title: `▶ Execute ${connectionLabel}`,
                command: 'dbooly.executeSqlAtCursor',
                arguments: [stmt.range],
            });
            lenses.push(lens);
        }

        return lenses;
    }

    private findStatements(text: string, document: vscode.TextDocument): { range: vscode.Range }[] {
        const statements: { range: vscode.Range }[] = [];
        const lines = text.split('\n');

        let statementStart: number | null = null;
        let lastNonEmptyLine = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments at the start
            if (statementStart === null) {
                if (trimmed === '' || trimmed.startsWith('--')) {
                    continue;
                }
                statementStart = i;
            }

            if (trimmed !== '' && !trimmed.startsWith('--')) {
                lastNonEmptyLine = i;
            }

            // Check if line ends with semicolon (statement boundary)
            if (trimmed.endsWith(';')) {
                statements.push({
                    range: new vscode.Range(statementStart, 0, i, line.length),
                });
                statementStart = null;
            }
        }

        // Handle last statement without semicolon
        if (statementStart !== null && lastNonEmptyLine >= statementStart) {
            statements.push({
                range: new vscode.Range(statementStart, 0, lastNonEmptyLine, lines[lastNonEmptyLine].length),
            });
        }

        // If no statements found but document has content, treat whole doc as one statement
        if (statements.length === 0 && text.trim().length > 0) {
            statements.push({
                range: new vscode.Range(0, 0, lines.length - 1, lines[lines.length - 1].length),
            });
        }

        return statements;
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
