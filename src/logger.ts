import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('dbooly');
    }
    return outputChannel;
}

export function log(message: string): void {
    const timestamp = new Date().toISOString();
    outputChannel?.appendLine(`[${timestamp}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    outputChannel?.appendLine(`[${timestamp}] ERROR: ${message}`);
    if (error instanceof Error) {
        outputChannel?.appendLine(`  ${error.message}`);
        if (error.stack) {
            outputChannel?.appendLine(`  ${error.stack}`);
        }
    } else if (error !== undefined) {
        outputChannel?.appendLine(`  ${String(error)}`);
    }
}

export function show(): void {
    outputChannel?.show();
}
