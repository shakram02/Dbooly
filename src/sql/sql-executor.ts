import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connection-manager';
import { ConnectionPool } from '../connections/connection-pool';
import { getSchemaProvider, QueryExecutionResult } from '../providers/schema-provider';
import { splitSqlStatements, findStatementAtLine } from './sql-statement-splitter';
import { log, logError } from '../logger';

export type DestructiveOpType = 'delete-no-where' | 'drop' | 'truncate';

export interface DestructiveOp {
    type: DestructiveOpType;
    table?: string;
    objectType?: string;
    objectName?: string;
}

/**
 * Analyzes SQL to detect destructive operations that require user confirmation.
 */
export function analyzeDestructiveOp(sql: string): DestructiveOp | null {
    const normalized = sql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .toUpperCase();

    // DELETE without WHERE
    if (normalized.startsWith('DELETE') && !normalized.includes('WHERE')) {
        const tableMatch = sql.match(/DELETE\s+FROM\s+[`"]?(\w+)[`"]?/i);
        return { type: 'delete-no-where', table: tableMatch?.[1] ?? 'unknown' };
    }

    // DROP statements
    if (normalized.startsWith('DROP')) {
        const match = sql.match(/DROP\s+(TABLE|DATABASE|INDEX|VIEW)\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/i);
        return { type: 'drop', objectType: match?.[1], objectName: match?.[2] };
    }

    // TRUNCATE
    if (normalized.startsWith('TRUNCATE')) {
        const match = sql.match(/TRUNCATE\s+(?:TABLE\s+)?[`"]?(\w+)[`"]?/i);
        return { type: 'truncate', table: match?.[1] ?? 'unknown' };
    }

    return null;
}

/**
 * Gets the SQL to execute from the active editor.
 * Priority:
 * 1. If text is selected, returns the selection
 * 2. Otherwise returns the statement at the cursor position
 * 3. Returns null if cursor is not in any statement
 */
export function getSqlFromEditor(editor: vscode.TextEditor): string | null {
    const selection = editor.selection;

    // If there's an explicit selection, use it
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    // Find the statement at the cursor position
    const text = editor.document.getText();
    const cursorLine = editor.selection.active.line;
    const statements = splitSqlStatements(text);

    const currentStmt = findStatementAtLine(statements, cursorLine);
    if (currentStmt) {
        return currentStmt.text;
    }

    // No statement at cursor
    return null;
}

export class SqlExecutor {
    private abortController: AbortController | null = null;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly connectionPool: ConnectionPool,
        private readonly onResult: (result: QueryExecutionResult) => void,
        private readonly onError: (error: string) => void,
        private readonly onExecuting: (connectionName: string) => void,
        private readonly onCancelled: () => void,
    ) {}

    async execute(sql: string): Promise<void> {
        const trimmedSql = sql.trim();
        if (!trimmedSql) {
            log('Execute: No SQL to execute');
            this.onError('No SQL to execute');
            return;
        }

        log(`Execute: ${trimmedSql.substring(0, 100)}${trimmedSql.length > 100 ? '...' : ''}`);

        // Get active connection, or prompt user to select one
        let activeConnectionId = this.connectionManager.getActiveConnectionId();
        if (!activeConnectionId) {
            log('Execute: No active connection, prompting user to select');
            const selected = await this.promptSelectConnection();
            if (!selected) {
                log('Execute: User cancelled connection selection');
                return;
            }
            activeConnectionId = selected;
        }

        const connection = this.connectionManager.getConnection(activeConnectionId);
        if (!connection) {
            log(`Execute: Connection not found for id ${activeConnectionId}`);
            this.onError('Active connection not found');
            return;
        }

        log(`Execute: Using connection "${connection.name}" (${connection.type})`);

        // Check for destructive operations
        const destructiveOp = analyzeDestructiveOp(trimmedSql);
        if (destructiveOp) {
            const confirmed = await this.confirmDestructiveOp(destructiveOp);
            if (!confirmed) {
                return;
            }
        }

        // Ensure password is set before executing (prompt if missing)
        if (!await this.connectionManager.ensurePassword(activeConnectionId)) {
            this.onError(`No password set for "${connection.name}". Set a password to execute queries.`);
            return;
        }

        // Execute query
        this.onExecuting(connection.name);
        this.abortController = new AbortController();

        try {
            const configWithPassword = await this.connectionManager.getConnectionWithPassword(activeConnectionId);
            if (!configWithPassword) {
                throw new Error('Connection credentials not found');
            }

            const provider = getSchemaProvider(connection.type);
            const result = await provider.executeQuery(
                this.connectionPool,
                configWithPassword,
                trimmedSql,
                { signal: this.abortController.signal }
            );

            log(`Execute: Query completed, ${result.rows.length} rows returned`);
            this.onResult(result);
        } catch (error) {
            if (this.abortController?.signal.aborted) {
                log('Execute: Query cancelled by user');
                this.onCancelled();
            } else {
                logError('Execute: Query failed', error);
                const message = error instanceof Error ? error.message : 'Query execution failed';
                this.onError(message);
            }
        } finally {
            this.abortController = null;
        }
    }

    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    private async promptSelectConnection(): Promise<string | null> {
        const connections = this.connectionManager.getAllConnections();

        if (connections.length === 0) {
            this.onError('No database connections configured. Add a connection in the sidebar.');
            vscode.commands.executeCommand('dbooly.connections.focus');
            return null;
        }

        const items = connections.map(conn => ({
            label: conn.name,
            description: `${conn.type} · ${conn.host}:${conn.port}/${conn.database}`,
            connectionId: conn.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a database connection',
            title: 'No Active Connection',
        });

        if (selected) {
            // Set as active connection so subsequent executions use it
            this.connectionManager.setActiveConnection(selected.connectionId);
            return selected.connectionId;
        }

        return null;
    }

    private async confirmDestructiveOp(op: DestructiveOp): Promise<boolean> {
        let message: string;
        let confirmText = 'Execute';

        switch (op.type) {
            case 'delete-no-where':
                message = `This DELETE statement has no WHERE clause and will delete ALL rows from "${op.table}". Continue?`;
                confirmText = 'Delete All';
                break;
            case 'drop':
                message = `This will permanently DROP ${op.objectType?.toLowerCase() || 'object'} "${op.objectName}". This cannot be undone. Continue?`;
                confirmText = 'Drop';
                break;
            case 'truncate':
                message = `This will TRUNCATE table "${op.table}", removing all rows. This cannot be rolled back. Continue?`;
                confirmText = 'Truncate';
                break;
        }

        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            confirmText,
            'Cancel'
        );

        return result === confirmText;
    }
}
