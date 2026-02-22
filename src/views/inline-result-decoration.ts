import * as vscode from 'vscode';
import { QueryType } from '../providers/schema-provider';

/**
 * Manages inline after-line decorations for SQL query execution feedback.
 * Only one decoration is active at a time (mirrors SqlExecutor's single-query model).
 */
export class InlineResultDecoration implements vscode.Disposable {
    private executingDecorationType: vscode.TextEditorDecorationType | null = null;
    private resultDecorationType: vscode.TextEditorDecorationType | null = null;
    private currentEditor: vscode.TextEditor | null = null;
    private currentLine: number | null = null;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (this.currentEditor && e.document === this.currentEditor.document) {
                    this.clear();
                }
            }),
            vscode.window.onDidChangeVisibleTextEditors(() => {
                if (this.currentEditor &&
                    !vscode.window.visibleTextEditors.includes(this.currentEditor)) {
                    this.clear();
                }
            })
        );
    }

    showExecuting(editor: vscode.TextEditor, line: number): void {
        this.clear();
        this.currentEditor = editor;
        this.currentLine = line;

        this.executingDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '  \u27F3 Executing...',
                color: new vscode.ThemeColor('descriptionForeground'),
                fontStyle: 'italic',
            },
        });

        editor.setDecorations(this.executingDecorationType, [this.makeRange(line)]);
    }

    showResult(queryType: QueryType, affectedRows: number, executionTimeMs: number): void {
        this.disposeExecuting();
        if (!this.currentEditor || this.currentLine === null) { return; }

        const isWarning = queryType === 'delete' || queryType === 'ddl';
        const icon = isWarning ? '\u26A0' : '\u2713';
        const rowText = affectedRows === 1 ? '1 row affected' : `${affectedRows} rows affected`;
        const contentText = `  ${icon} ${rowText} (${executionTimeMs}ms)`;

        let color: vscode.ThemeColor;
        if (isWarning) {
            color = new vscode.ThemeColor('editorWarning.foreground');
        } else if (queryType === 'insert') {
            color = new vscode.ThemeColor('testing.iconPassed');
        } else {
            color = new vscode.ThemeColor('descriptionForeground');
        }

        this.resultDecorationType = vscode.window.createTextEditorDecorationType({
            after: { contentText, color },
        });

        this.currentEditor.setDecorations(this.resultDecorationType, [this.makeRange(this.currentLine)]);
    }

    clear(): void {
        this.disposeExecuting();
        this.disposeResult();
        this.currentEditor = null;
        this.currentLine = null;
    }

    dispose(): void {
        this.clear();
        this.disposables.forEach(d => d.dispose());
    }

    private makeRange(line: number): vscode.DecorationOptions {
        const lineLength = this.currentEditor!.document.lineAt(line).text.length;
        return { range: new vscode.Range(line, lineLength, line, lineLength) };
    }

    private disposeExecuting(): void {
        this.executingDecorationType?.dispose();
        this.executingDecorationType = null;
    }

    private disposeResult(): void {
        this.resultDecorationType?.dispose();
        this.resultDecorationType = null;
    }
}
