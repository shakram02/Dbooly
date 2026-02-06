import * as vscode from 'vscode';
import { format } from 'sql-formatter';
import { DatabaseType } from '../models/connection';
import { ConnectionManager } from '../connections/connection-manager';
import { splitSqlStatements } from './sql-statement-splitter';

/**
 * SQL formatter using sql-formatter library.
 * Formats SQL based on the active connection's database type.
 * Implements DocumentFormattingEditProvider to integrate with VSCode's format command.
 *
 * IMPORTANT: This formatter preserves empty lines between statements,
 * as they serve as statement delimiters in dbooly's multi-statement execution model.
 */
export class SqlFormatter implements vscode.DocumentFormattingEditProvider {
    constructor(private readonly connectionManager: ConnectionManager) {}

    /**
     * Provides formatting edits for VSCode's formatting system.
     * Formats each statement individually to preserve empty line separators.
     */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions
    ): vscode.TextEdit[] | null {
        const text = document.getText();
        const dialect = this.getDialect();
        const statements = splitSqlStatements(text);

        // If no statements or single statement, format normally but preserve structure
        if (statements.length === 0) {
            return null;
        }

        try {
            const edits: vscode.TextEdit[] = [];

            for (const stmt of statements) {
                const formatted = this.formatStatement(stmt.text.trim(), dialect, options);
                if (formatted === null) {
                    continue; // Skip if formatting fails for this statement
                }

                const range = new vscode.Range(
                    document.positionAt(stmt.startOffset),
                    document.positionAt(stmt.endOffset)
                );

                // Preserve leading whitespace/newlines before the statement
                const leadingWhitespace = this.getLeadingWhitespace(stmt.text);
                edits.push(vscode.TextEdit.replace(range, leadingWhitespace + formatted));
            }

            return edits.length > 0 ? edits : null;
        } catch {
            return null;
        }
    }

    /**
     * Formats a single SQL statement.
     */
    private formatStatement(
        text: string,
        dialect: 'mysql' | 'postgresql' | 'sql',
        options: vscode.FormattingOptions
    ): string | null {
        try {
            return format(text, {
                language: dialect,
                tabWidth: options.tabSize,
                useTabs: !options.insertSpaces,
                keywordCase: 'upper',
                linesBetweenQueries: 1 // Not relevant for single statements
            });
        } catch {
            return null;
        }
    }

    /**
     * Extracts leading whitespace (spaces, tabs, newlines) from text.
     */
    private getLeadingWhitespace(text: string): string {
        const match = text.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * Formats the current SQL document (for manual command invocation).
     */
    async formatDocument(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            vscode.window.showWarningMessage('No SQL file is active');
            return;
        }

        const edits = this.provideDocumentFormattingEdits(editor.document, {
            tabSize: editor.options.tabSize as number || 4,
            insertSpaces: editor.options.insertSpaces as boolean
        });

        if (edits && edits.length > 0) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            for (const edit of edits) {
                workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
            }
            await vscode.workspace.applyEdit(workspaceEdit);
        } else {
            vscode.window.showErrorMessage('Failed to format SQL');
        }
    }

    /**
     * Maps dbooly database type to sql-formatter dialect.
     */
    private getDialect(): 'mysql' | 'postgresql' | 'sql' {
        const activeId = this.connectionManager.getActiveConnectionId();
        if (!activeId) {
            return 'sql'; // Generic SQL
        }

        const conn = this.connectionManager.getConnection(activeId);
        if (!conn) {
            return 'sql';
        }

        const dialectMap: Record<DatabaseType, 'mysql' | 'postgresql' | 'sql'> = {
            mysql: 'mysql'
            // Add more as dbooly supports them
        };

        return dialectMap[conn.type] || 'sql';
    }
}
