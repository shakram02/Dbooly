import * as vscode from 'vscode';
import { ConnectionConfig } from '../models/connection';
import { TableInfo } from '../models/table';
import { ColumnInfo } from '../models/column';
import { QueryResult, SortOptions, SortDirection, QueryExecutionResult, UpdateCellResult, InsertRowResult, DeleteRowResult } from '../providers/schema-provider';

export interface EditabilityInfo {
    editable: boolean;
    tableName: string;
    identifyingColumns: string[];
    columnMetadata: Array<{
        name: string;
        dataType: string;
        nullable: boolean;
        keyType: 'PRIMARY' | 'UNIQUE' | 'FOREIGN' | null;
    }>;
    reason?: string;
}

export interface MutationCallbacks {
    updateCell(tableName: string, primaryKeys: Record<string, unknown>, columnName: string, newValue: unknown): Promise<UpdateCellResult>;
    insertRow(tableName: string, values: Record<string, unknown>): Promise<InsertRowResult>;
    deleteRow(tableName: string, primaryKeys: Record<string, unknown>): Promise<DeleteRowResult>;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

interface PanelConfig {
    title: string;
    subtitle: string;
    mode: 'table' | 'query';
}

export class TableDataPanel {
    private static instance: TableDataPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private sortColumn: string | null = null;
    private sortDirection: SortDirection = null;
    private config: PanelConfig;
    private getData: ((sort?: SortOptions) => Promise<QueryResult>) | null = null;
    private webviewReady = false;
    private pendingMessages: object[] = [];
    private editabilityInfo: EditabilityInfo | null = null;
    private mutationCallbacks: MutationCallbacks | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        config: PanelConfig,
    ) {
        this.panel = panel;
        this.config = config;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.setupMessageHandler();
    }

    private postMessage(message: object): void {
        if (this.webviewReady) {
            this.panel.webview.postMessage(message);
        } else {
            this.pendingMessages.push(message);
        }
    }

    private flushPendingMessages(): void {
        for (const message of this.pendingMessages) {
            this.panel.webview.postMessage(message);
        }
        this.pendingMessages = [];
    }

    private setupMessageHandler(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'ready') {
                    this.webviewReady = true;
                    this.flushPendingMessages();
                } else if (message.command === 'sort' && this.getData && this.config.mode === 'table') {
                    // Table mode: server-side sorting
                    this.sortColumn = message.column;
                    this.sortDirection = message.direction;
                    await this.loadData(true);
                } else if (message.command === 'updateCell') {
                    await this.handleUpdateCell(message);
                } else if (message.command === 'deleteRow') {
                    await this.handleDeleteRow(message);
                } else if (message.command === 'insertRow') {
                    await this.handleInsertRow(message);
                } else if (message.command === 'cloneRow') {
                    await this.handleCloneRow(message);
                }
                // Query mode sorting is handled client-side in the webview
            },
            null,
            this.disposables
        );
    }

    /**
     * Shows table data with server-side sorting.
     */
    static showTableData(
        connection: ConnectionConfig,
        table: TableInfo,
        getData: (sort?: SortOptions) => Promise<QueryResult>,
        editabilityInfo?: EditabilityInfo,
        mutationCallbacks?: MutationCallbacks,
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (TableDataPanel.instance) {
            TableDataPanel.instance.panel.reveal(column);
            TableDataPanel.instance.updateForTableData(connection, table, getData, editabilityInfo, mutationCallbacks);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dboolyData',
            `${table.name} - ${connection.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        const config: PanelConfig = {
            title: table.name,
            subtitle: `${connection.name} - ${connection.host}:${connection.port}/${connection.database}`,
            mode: 'table',
        };

        TableDataPanel.instance = new TableDataPanel(panel, config);
        TableDataPanel.instance.getData = getData;
        TableDataPanel.instance.editabilityInfo = editabilityInfo || null;
        TableDataPanel.instance.mutationCallbacks = mutationCallbacks || null;
        TableDataPanel.instance.loadData();
    }

    /**
     * Shows query results with client-side sorting.
     */
    static showQueryResults(): TableDataPanel {
        if (TableDataPanel.instance) {
            TableDataPanel.instance.panel.reveal(vscode.ViewColumn.Beside, true);
            TableDataPanel.instance.switchToQueryMode();
            return TableDataPanel.instance;
        }

        const panel = vscode.window.createWebviewPanel(
            'dboolyData',
            'Query Results',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        const config: PanelConfig = {
            title: 'Query Results',
            subtitle: '',
            mode: 'query',
        };

        TableDataPanel.instance = new TableDataPanel(panel, config);
        return TableDataPanel.instance;
    }

    /**
     * Disposes the panel if it exists.
     */
    static dispose(): void {
        if (TableDataPanel.instance) {
            TableDataPanel.instance.panel.dispose();
        }
    }

    // Methods for query results mode
    showExecuting(connectionName: string): void {
        this.config.subtitle = connectionName;
        this.postMessage({
            command: 'loading',
            message: `Executing query on ${connectionName}...`,
        });
    }

    showResult(result: QueryExecutionResult, editabilityInfo?: EditabilityInfo, mutationCallbacks?: MutationCallbacks): void {
        if (editabilityInfo) {
            this.editabilityInfo = editabilityInfo;
        }
        if (mutationCallbacks) {
            this.mutationCallbacks = mutationCallbacks;
        }

        if (result.type === 'select' && result.columns && result.rows) {
            const dataMessage: Record<string, unknown> = {
                command: 'data',
                columns: result.columns,
                rows: result.rows,
                query: result.query,
                executionTime: result.executionTimeMs,
                truncated: result.truncated,
                affectedRows: null,
            };
            if (this.editabilityInfo) {
                dataMessage.editable = this.editabilityInfo.editable;
                dataMessage.identifyingColumns = this.editabilityInfo.identifyingColumns;
                dataMessage.columnMetadata = this.editabilityInfo.columnMetadata;
                dataMessage.editabilityReason = this.editabilityInfo.reason;
                dataMessage.tableName = this.editabilityInfo.tableName;
            }
            this.postMessage(dataMessage);
        } else {
            // INSERT/UPDATE/DELETE result
            this.postMessage({
                command: 'nonSelectResult',
                query: result.query,
                affectedRows: result.affectedRows ?? 0,
                executionTime: result.executionTimeMs,
            });
        }
    }

    showError(message: string): void {
        this.postMessage({ command: 'error', message });
    }

    showCancelled(): void {
        this.postMessage({ command: 'cancelled' });
    }

    private switchToQueryMode(): void {
        if (this.config.mode !== 'query') {
            this.config.mode = 'query';
            this.config.title = 'Query Results';
            this.config.subtitle = '';
            this.getData = null;
            this.sortColumn = null;
            this.sortDirection = null;
            this.panel.title = 'Query Results';
            this.webviewReady = false;
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    private updateForTableData(
        connection: ConnectionConfig,
        table: TableInfo,
        getData: (sort?: SortOptions) => Promise<QueryResult>,
        editabilityInfo?: EditabilityInfo,
        mutationCallbacks?: MutationCallbacks,
    ): void {
        this.config = {
            title: table.name,
            subtitle: `${connection.name} - ${connection.host}:${connection.port}/${connection.database}`,
            mode: 'table',
        };
        this.getData = getData;
        this.editabilityInfo = editabilityInfo || null;
        this.mutationCallbacks = mutationCallbacks || null;
        this.sortColumn = null;
        this.sortDirection = null;
        this.panel.title = `${table.name} - ${connection.name}`;
        this.webviewReady = false;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.loadData();
    }

    private async loadData(skipLoadingState = false): Promise<void> {
        if (!this.getData) return;

        if (!skipLoadingState) {
            this.postMessage({ command: 'loading' });
        }

        try {
            const sort = this.sortColumn && this.sortDirection
                ? { column: this.sortColumn, direction: this.sortDirection }
                : undefined;
            const result = await this.getData(sort);
            const dataMessage: Record<string, unknown> = {
                command: 'data',
                columns: result.columns,
                rows: result.rows,
                query: result.query,
                sort: sort ? { column: sort.column, direction: sort.direction } : null,
            };
            if (this.editabilityInfo) {
                dataMessage.editable = this.editabilityInfo.editable;
                dataMessage.identifyingColumns = this.editabilityInfo.identifyingColumns;
                dataMessage.columnMetadata = this.editabilityInfo.columnMetadata;
                dataMessage.editabilityReason = this.editabilityInfo.reason;
                dataMessage.tableName = this.editabilityInfo.tableName;
            }
            this.postMessage(dataMessage);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load data';
            this.postMessage({ command: 'error', message });
        }
    }

    private async handleUpdateCell(message: { column: string; value: unknown; primaryKeys: Record<string, unknown>; rowIndex: number }): Promise<void> {
        if (!this.mutationCallbacks || !this.editabilityInfo) {
            this.postMessage({ command: 'cellUpdateResult', success: false, error: 'Editing not available', column: message.column, rowIndex: message.rowIndex });
            return;
        }
        const result = await this.mutationCallbacks.updateCell(
            this.editabilityInfo.tableName,
            message.primaryKeys,
            message.column,
            message.value
        );
        this.postMessage({
            command: 'cellUpdateResult',
            success: result.success,
            column: message.column,
            rowIndex: message.rowIndex,
            updatedRow: result.updatedRow,
            error: result.error,
        });
        if (!result.success && result.error) {
            vscode.window.showErrorMessage(`Update failed: ${result.error}`);
        }
    }

    private async handleDeleteRow(message: { primaryKeys: Record<string, unknown>; rowIndex: number }): Promise<void> {
        if (!this.mutationCallbacks || !this.editabilityInfo) {
            this.postMessage({ command: 'deleteRowResult', success: false, error: 'Editing not available', rowIndex: message.rowIndex });
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            'Delete this row?',
            { modal: true },
            'Delete',
        );
        if (confirm !== 'Delete') {
            return;
        }

        const result = await this.mutationCallbacks.deleteRow(
            this.editabilityInfo.tableName,
            message.primaryKeys
        );
        this.postMessage({
            command: 'deleteRowResult',
            success: result.success,
            rowIndex: message.rowIndex,
            error: result.error,
        });
        if (!result.success && result.error) {
            vscode.window.showErrorMessage(`Delete failed: ${result.error}`);
        }
    }

    private async handleInsertRow(message: { values: Record<string, unknown> }): Promise<void> {
        if (!this.mutationCallbacks || !this.editabilityInfo) {
            this.postMessage({ command: 'insertRowResult', success: false, error: 'Editing not available' });
            return;
        }
        const result = await this.mutationCallbacks.insertRow(
            this.editabilityInfo.tableName,
            message.values
        );
        this.postMessage({
            command: 'insertRowResult',
            success: result.success,
            newRow: result.newRow,
            error: result.error,
        });
        if (!result.success && result.error) {
            vscode.window.showErrorMessage(`Insert failed: ${result.error}`);
        }
    }

    private async handleCloneRow(message: { values: Record<string, unknown>; primaryKeys: Record<string, unknown> }): Promise<void> {
        if (!this.mutationCallbacks || !this.editabilityInfo) {
            this.postMessage({ command: 'insertRowResult', success: false, error: 'Editing not available' });
            return;
        }
        // Clone: insert with all non-identifying-column values from the source row
        const identifyingCols = new Set(this.editabilityInfo.identifyingColumns);
        const cloneValues: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(message.values)) {
            if (!identifyingCols.has(key)) {
                cloneValues[key] = val;
            }
        }
        const result = await this.mutationCallbacks.insertRow(
            this.editabilityInfo.tableName,
            cloneValues
        );
        this.postMessage({
            command: 'insertRowResult',
            success: result.success,
            newRow: result.newRow,
            error: result.error,
        });
        if (!result.success && result.error) {
            vscode.window.showErrorMessage(`Clone failed: ${result.error}`);
        }
    }

    private dispose(): void {
        TableDataPanel.instance = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const isQueryMode = this.config.mode === 'query';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>${this.escapeHtml(this.config.title)}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            color-scheme: var(--vscode-color-scheme);
            padding: 16px;
            margin: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            margin-bottom: 16px;
            flex-shrink: 0;
        }
        h1 {
            font-size: 1.4em;
            margin: 0 0 4px 0;
            font-weight: 500;
        }
        .subtitle {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            flex-shrink: 0;
        }
        .search-container {
            position: relative;
            flex: 1;
            max-width: 400px;
        }
        .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--vscode-input-placeholderForeground);
            font-size: 14px;
            pointer-events: none;
        }
        .search-input {
            width: 100%;
            padding: 6px 10px 6px 32px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
        }
        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .search-hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }
        .row-count {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }
        .execution-time {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }
        .table-container {
            overflow: auto;
            border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            border-radius: 4px;
            flex: 1;
            min-height: 0;
        }
        table {
            border-collapse: collapse;
            font-size: 13px;
            table-layout: fixed;
            width: max-content;
            min-width: 100%;
        }
        th, td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            border-right: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            white-space: nowrap;
            min-width: 60px;
        }
        td {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        th:last-child, td:last-child {
            border-right: none;
        }
        th {
            background-color: var(--vscode-editor-lineHighlightBackground);
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 1;
            user-select: none;
            overflow: visible;
            cursor: pointer;
        }
        th:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        th .th-content {
            overflow: hidden;
            text-overflow: ellipsis;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-right: 8px;
            gap: 8px;
        }
        th .column-name {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        th .sort-arrows {
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            font-size: 8px;
            line-height: 1;
            gap: 1px;
        }
        th .sort-arrow {
            opacity: 0.3;
            transition: opacity 0.15s;
        }
        th .sort-arrow.active {
            opacity: 1;
        }
        th:hover .sort-arrow {
            opacity: 0.5;
        }
        th:hover .sort-arrow.active {
            opacity: 1;
        }
        th .resize-handle {
            position: absolute;
            right: -3px;
            top: 0;
            bottom: 0;
            width: 7px;
            cursor: col-resize;
            background: transparent;
            z-index: 10;
        }
        th .resize-handle:hover,
        th .resize-handle.active {
            background-color: var(--vscode-focusBorder);
        }
        body.resizing {
            cursor: col-resize !important;
            user-select: none !important;
        }
        body.resizing * {
            cursor: col-resize !important;
            user-select: none !important;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:hover td {
            background-color: var(--vscode-list-hoverBackground);
        }
        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .loading, .error, .empty-state, .success-message, .cancelled-message {
            padding: 40px 20px;
            text-align: center;
        }
        .loading {
            color: var(--vscode-descriptionForeground);
        }
        .error {
            color: var(--vscode-errorForeground);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .error-icon {
            font-size: 16px;
        }
        .empty-state {
            color: var(--vscode-descriptionForeground);
        }
        .success-message {
            color: var(--vscode-testing-iconPassed, #89d185);
        }
        .cancelled-message {
            color: var(--vscode-descriptionForeground);
        }
        .highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
            border-radius: 2px;
        }
        tr.hidden {
            display: none;
        }
        .no-results {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .query-display-wrapper {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            margin-bottom: 12px;
            flex-shrink: 0;
            cursor: pointer;
        }
        .query-display-wrapper.hidden {
            display: none;
        }
        .query-toggle {
            flex-shrink: 0;
            font-size: 10px;
            transition: transform 0.15s;
            opacity: 0.7;
            padding-top: 8px;
        }
        .query-display-wrapper.expanded .query-toggle {
            transform: rotate(90deg);
        }
        .query-display {
            flex: 1;
            min-width: 0;
            background-color: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.1));
            border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            border-radius: 4px;
            padding: 8px 12px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            color: var(--vscode-foreground);
            user-select: text;
        }
        .query-display-wrapper:not(.expanded) .query-display {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .query-display-wrapper.expanded .query-display {
            white-space: pre-wrap;
            word-break: break-word;
        }
        .truncation-notice {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            margin-bottom: 8px;
            background-color: transparent;
            border-radius: 3px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
        }
        .truncation-notice.hidden {
            display: none;
        }
        .truncation-notice .info-icon {
            opacity: 0.6;
        }
        /* Edit mode styles */
        .lock-toggle {
            background: none;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
        }
        .lock-toggle:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .lock-toggle.hidden {
            display: none;
        }
        .editability-hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }
        .editability-hint.hidden {
            display: none;
        }
        .add-row-btn {
            background: none;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
        }
        .add-row-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .add-row-btn.hidden {
            display: none;
        }
        /* Gutter column */
        .gutter-col {
            width: 40px;
            min-width: 40px;
            max-width: 40px;
            padding: 4px !important;
            text-align: center;
            border-right: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
        }
        .gutter-col.hidden-gutter {
            display: none;
        }
        .gutter-actions {
            display: flex;
            gap: 2px;
            justify-content: center;
            opacity: 0;
        }
        tr:hover .gutter-actions {
            opacity: 1;
        }
        .gutter-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 2px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            border-radius: 3px;
            line-height: 1;
        }
        .gutter-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
            color: var(--vscode-foreground);
        }
        .gutter-btn.delete-btn:hover {
            color: var(--vscode-errorForeground);
        }
        /* Cell edit icon & editing */
        td {
            position: relative;
        }
        .edit-icon {
            display: none;
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-background);
            padding: 1px 3px;
            border-radius: 3px;
            border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            z-index: 2;
        }
        tr:hover .edit-icon {
            display: inline-block;
        }
        .cell-editing {
            padding: 2px 4px !important;
        }
        .cell-editor-wrap {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .cell-input {
            flex: 1;
            min-width: 60px;
            padding: 3px 6px;
            border: 1px solid var(--vscode-focusBorder);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: 13px;
            border-radius: 3px;
            outline: none;
        }
        .cell-input:focus {
            border-color: var(--vscode-focusBorder);
        }
        .null-toggle {
            font-size: 9px;
            padding: 2px 4px;
            cursor: pointer;
            background: none;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-descriptionForeground);
            border-radius: 3px;
            white-space: nowrap;
            line-height: 1;
        }
        .null-toggle:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .null-toggle.active {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .cell-checkbox {
            cursor: pointer;
            width: 16px;
            height: 16px;
        }
        .cell-textarea-overlay {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 100;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 4px;
            padding: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            min-width: 250px;
            min-height: 100px;
        }
        .cell-textarea {
            width: 100%;
            min-height: 80px;
            padding: 4px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            border-radius: 3px;
            resize: both;
        }
        .textarea-actions {
            display: flex;
            gap: 6px;
            margin-top: 4px;
            justify-content: flex-end;
        }
        .textarea-btn {
            padding: 3px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
            color: var(--vscode-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .textarea-btn.save {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        /* Flash animations */
        @keyframes flash-success {
            0% { background-color: rgba(137, 209, 133, 0.3); }
            100% { background-color: transparent; }
        }
        @keyframes flash-error {
            0% { background-color: rgba(255, 85, 85, 0.3); }
            100% { background-color: transparent; }
        }
        @keyframes fade-out {
            0% { opacity: 1; }
            100% { opacity: 0; height: 0; padding: 0; overflow: hidden; }
        }
        .flash-success {
            animation: flash-success 1s ease-out;
        }
        .flash-error {
            animation: flash-error 1.5s ease-out;
        }
        .fade-out {
            animation: fade-out 0.3s ease-out forwards;
        }
        .cell-loading {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header" id="header">
        <h1 id="title">${this.escapeHtml(this.config.title)}</h1>
        <div class="subtitle" id="subtitle">${this.escapeHtml(this.config.subtitle)}</div>
    </div>
    <div class="toolbar">
        <div class="search-container">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="searchInput" class="search-input" placeholder="Filter rows..." disabled>
        </div>
        <span class="search-hint">Local filter only</span>
        <button id="lockToggle" class="lock-toggle hidden" title="Toggle edit mode">&#128274; Read-only</button>
        <span id="editabilityHint" class="editability-hint hidden"></span>
        <button id="addRowBtn" class="add-row-btn hidden" title="Add new row">+ Add Row</button>
        <span id="executionTime" class="execution-time"></span>
        <span id="rowCount" class="row-count"></span>
    </div>
    <div id="queryWrapper" class="query-display-wrapper hidden">
        <span class="query-toggle">&#9658;</span>
        <div id="queryDisplay" class="query-display"></div>
    </div>
    <div id="truncationNotice" class="truncation-notice hidden">
        <span class="info-icon">&#9432;</span>
        <span>Showing first 1000 rows. Add a LIMIT clause to your query for specific results.</span>
    </div>
    <div id="content" class="table-container">
        <div class="loading">Loading data...</div>
    </div>

    <script nonce="${nonce}">
        const contentDiv = document.getElementById('content');
        const rowCountDiv = document.getElementById('rowCount');
        const executionTimeDiv = document.getElementById('executionTime');
        const searchInput = document.getElementById('searchInput');
        const queryWrapper = document.getElementById('queryWrapper');
        const queryDisplayDiv = document.getElementById('queryDisplay');
        const truncationNotice = document.getElementById('truncationNotice');
        const titleEl = document.getElementById('title');
        const subtitleEl = document.getElementById('subtitle');

        const vscode = acquireVsCodeApi();
        const isQueryMode = ${isQueryMode};
        const lockToggle = document.getElementById('lockToggle');
        const editabilityHint = document.getElementById('editabilityHint');
        const addRowBtn = document.getElementById('addRowBtn');

        // Signal the extension that the webview JS is ready to receive messages
        vscode.postMessage({ command: 'ready' });

        let allColumns = [];
        let allRows = [];
        let originalRows = []; // Keep original order for unsort
        let currentQuery = ''; // Store original query for expanded view
        let totalRows = 0;
        let columnWidths = {};
        let currentSortColumn = null;
        let currentSortDirection = null;

        // Editing state
        let isEditable = false;
        let isReadOnly = true; // Default locked
        let identifyingColumns = [];
        let columnMetadata = [];
        let editingCell = null; // { rowIndex, colIndex }
        let editTableName = '';

        function valueToString(val) {
            if (val === null || val === undefined) return '';
            if (typeof val === 'object' && !(val instanceof Date)) {
                try { return JSON.stringify(val); } catch { return String(val); }
            }
            return String(val);
        }

        function getEditorType(dataType) {
            if (!dataType) return 'text';
            const dt = dataType.toLowerCase();
            if (dt === 'bool' || dt === 'boolean' || dt === 'tinyint(1)') return 'checkbox';
            if (dt === 'date') return 'date';
            if (dt.includes('datetime') || dt.includes('timestamp')) return 'datetime';
            if (dt.includes('text') || dt.includes('json') || dt === 'jsonb') return 'textarea';
            if (dt.includes('blob') || dt.includes('bytea') || dt.includes('binary')) return 'disabled';
            return 'text';
        }

        function isBinaryColumn(colIndex) {
            const meta = columnMetadata[colIndex];
            return meta && getEditorType(meta.dataType) === 'disabled';
        }

        function getColumnMeta(colIndex) {
            const colName = allColumns[colIndex];
            return columnMetadata.find(m => m.name === colName);
        }

        function getPrimaryKeyValues(rowIndex) {
            const row = allRows[rowIndex];
            if (!row) return null;
            const pks = {};
            for (const pkCol of identifyingColumns) {
                const idx = allColumns.indexOf(pkCol);
                if (idx === -1) return null;
                pks[pkCol] = row[idx];
            }
            return pks;
        }

        function getRowValues(rowIndex) {
            const row = allRows[rowIndex];
            if (!row) return {};
            const vals = {};
            allColumns.forEach((col, i) => { vals[col] = row[i]; });
            return vals;
        }

        // Lock toggle
        lockToggle.addEventListener('click', () => {
            isReadOnly = !isReadOnly;
            lockToggle.innerHTML = isReadOnly ? '&#128274; Read-only' : '&#128275; Editing';
            lockToggle.title = isReadOnly ? 'Click to enable editing' : 'Click to enable read-only mode';
            addRowBtn.classList.toggle('hidden', isReadOnly || !isEditable);
            if (isReadOnly && editingCell) {
                cancelEdit();
            }
            renderFilteredTable(searchInput.value.trim());
        });

        // Add Row
        addRowBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'insertRow', values: {} });
        });

        function showEditControls() {
            if (isEditable) {
                lockToggle.classList.remove('hidden');
                editabilityHint.classList.add('hidden');
            } else {
                lockToggle.classList.add('hidden');
                if (editabilityHint.textContent) {
                    editabilityHint.classList.remove('hidden');
                }
            }
            addRowBtn.classList.toggle('hidden', isReadOnly || !isEditable);
        }

        function enterEditMode(rowIndex, colIndex) {
            if (isReadOnly || !isEditable) return;
            if (isBinaryColumn(colIndex)) return;

            const meta = getColumnMeta(colIndex);
            if (!meta) return;

            // Cancel any existing edit
            if (editingCell) cancelEdit();

            editingCell = { rowIndex, colIndex };
            const td = getCell(rowIndex, colIndex);
            if (!td) return;

            const currentValue = allRows[rowIndex][colIndex];
            const editorType = getEditorType(meta.dataType);

            td.classList.add('cell-editing');

            if (editorType === 'checkbox') {
                const newVal = !(currentValue === true || currentValue === 1 || currentValue === '1');
                commitEdit(rowIndex, colIndex, newVal);
                editingCell = null;
                return;
            }

            if (editorType === 'textarea') {
                renderTextareaEditor(td, rowIndex, colIndex, currentValue, meta);
                return;
            }

            const wrap = document.createElement('div');
            wrap.className = 'cell-editor-wrap';

            const input = document.createElement('input');
            input.className = 'cell-input';
            input.type = editorType === 'date' ? 'date' : editorType === 'datetime' ? 'datetime-local' : 'text';

            if (currentValue !== null && currentValue !== undefined) {
                if (editorType === 'date' && currentValue instanceof Date) {
                    input.value = currentValue.toISOString().slice(0, 10);
                } else if (editorType === 'datetime' && currentValue instanceof Date) {
                    input.value = currentValue.toISOString().slice(0, 16);
                } else {
                    input.value = valueToString(currentValue);
                }
            }

            let isNull = currentValue === null;

            // NULL toggle for nullable columns
            if (meta.nullable) {
                const nullBtn = document.createElement('button');
                nullBtn.className = 'null-toggle' + (isNull ? ' active' : '');
                nullBtn.textContent = 'NULL';
                nullBtn.title = isNull ? 'Unset NULL' : 'Set to NULL';
                nullBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isNull) {
                        isNull = false;
                        nullBtn.classList.remove('active');
                        input.disabled = false;
                        input.value = '';
                        input.focus();
                    } else {
                        isNull = true;
                        nullBtn.classList.add('active');
                        input.disabled = true;
                        input.value = '';
                        input.placeholder = 'NULL';
                        commitEdit(rowIndex, colIndex, null);
                        editingCell = null;
                    }
                });
                wrap.appendChild(nullBtn);
            }

            if (isNull) {
                input.disabled = true;
                input.placeholder = 'NULL';
            }

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = isNull ? null : input.value;
                    commitEdit(rowIndex, colIndex, val);
                    editingCell = null;
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    const val = isNull ? null : input.value;
                    commitEdit(rowIndex, colIndex, val);
                    editingCell = null;
                    // Move to next editable cell
                    const nextCol = colIndex + 1 < allColumns.length ? colIndex + 1 : 0;
                    const nextRow = nextCol === 0 ? rowIndex + 1 : rowIndex;
                    if (nextRow < allRows.length) {
                        setTimeout(() => enterEditMode(nextRow, nextCol), 50);
                    }
                }
            });

            input.addEventListener('blur', (e) => {
                // Delay to allow null toggle click
                setTimeout(() => {
                    if (editingCell && editingCell.rowIndex === rowIndex && editingCell.colIndex === colIndex) {
                        const val = isNull ? null : input.value;
                        commitEdit(rowIndex, colIndex, val);
                        editingCell = null;
                    }
                }, 150);
            });

            wrap.insertBefore(input, wrap.firstChild);
            td.innerHTML = '';
            td.appendChild(wrap);
            input.focus();
            input.select();
        }

        function renderTextareaEditor(td, rowIndex, colIndex, currentValue, meta) {
            const overlay = document.createElement('div');
            overlay.className = 'cell-textarea-overlay';

            const textarea = document.createElement('textarea');
            textarea.className = 'cell-textarea';
            textarea.value = currentValue !== null && currentValue !== undefined ? valueToString(currentValue) : '';

            const actions = document.createElement('div');
            actions.className = 'textarea-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'textarea-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => { cancelEdit(); });

            const saveBtn = document.createElement('button');
            saveBtn.className = 'textarea-btn save';
            saveBtn.textContent = 'Save (Ctrl+Enter)';
            saveBtn.addEventListener('click', () => {
                commitEdit(rowIndex, colIndex, textarea.value);
                editingCell = null;
            });

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    commitEdit(rowIndex, colIndex, textarea.value);
                    editingCell = null;
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                }
            });

            actions.appendChild(cancelBtn);
            actions.appendChild(saveBtn);
            overlay.appendChild(textarea);
            overlay.appendChild(actions);

            // Position near the cell
            td.style.position = 'relative';
            td.innerHTML = '';
            td.appendChild(overlay);
            textarea.focus();
        }

        function cancelEdit() {
            if (!editingCell) return;
            const { rowIndex, colIndex } = editingCell;
            editingCell = null;
            const td = getCell(rowIndex, colIndex);
            if (td) {
                td.classList.remove('cell-editing');
                const searchTerm = searchInput.value.trim();
                td.innerHTML = formatCellContent(allRows[rowIndex][colIndex], colIndex, rowIndex, searchTerm);
            }
        }

        function commitEdit(rowIndex, colIndex, newValue) {
            const colName = allColumns[colIndex];
            const originalValue = allRows[rowIndex][colIndex];

            // No-op if value unchanged
            if (newValue === originalValue || (newValue === '' && originalValue === '') ||
                (String(newValue) === String(originalValue) && newValue !== null && originalValue !== null)) {
                cancelEdit();
                return;
            }

            const pks = getPrimaryKeyValues(rowIndex);
            if (!pks) return;

            // Show loading
            const td = getCell(rowIndex, colIndex);
            if (td) {
                td.innerHTML = '<span class="cell-loading">Saving...</span>';
            }

            vscode.postMessage({
                command: 'updateCell',
                column: colName,
                value: newValue,
                primaryKeys: pks,
                rowIndex: rowIndex
            });
        }

        function getCell(rowIndex, colIndex) {
            const table = contentDiv.querySelector('table');
            if (!table) return null;
            const gutterOffset = (!isReadOnly && isEditable) ? 1 : 0;
            const rows = table.querySelectorAll('tbody tr');
            if (!rows[rowIndex]) return null;
            return rows[rowIndex].children[colIndex + gutterOffset] || null;
        }

        function flashCell(rowIndex, colIndex, type) {
            const td = getCell(rowIndex, colIndex);
            if (!td) return;
            td.classList.add(type === 'success' ? 'flash-success' : 'flash-error');
            setTimeout(() => {
                td.classList.remove('flash-success', 'flash-error');
            }, 1500);
        }

        function formatCellContent(cell, colIndex, rowIndex, searchTerm) {
            const showEditIcon = isEditable && !isReadOnly && !isBinaryColumn(colIndex);
            let content = formatValue(cell, searchTerm);
            if (showEditIcon) {
                content += '<span class="edit-icon" data-row="' + rowIndex + '" data-col="' + colIndex + '" title="Edit">&#9998;</span>';
            }
            return content;
        }

        // Query display toggle functionality
        function normalizeQuery(query) {
            return query.replace(/\\s+/g, ' ').trim();
        }

        function updateQueryDisplay() {
            if (!currentQuery) {
                queryWrapper.classList.add('hidden');
                return;
            }
            queryWrapper.classList.remove('hidden');
            const isExpanded = queryWrapper.classList.contains('expanded');
            queryDisplayDiv.textContent = isExpanded ? currentQuery : normalizeQuery(currentQuery);
        }

        queryWrapper.addEventListener('click', () => {
            if (!currentQuery) return;
            queryWrapper.classList.toggle('expanded');
            updateQueryDisplay();
        });

        function escapeHtml(text) {
            if (text === null || text === undefined) {
                return '<span class="null-value">NULL</span>';
            }
            const str = String(text);
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        function formatValue(value, searchTerm) {
            if (value === null || value === undefined) {
                return '<span class="null-value">NULL</span>';
            }
            if (typeof value === 'object') {
                if (value instanceof Date) {
                    return highlightText(value.toISOString(), searchTerm);
                }
                if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer ||
                    (value.type === 'Buffer' && Array.isArray(value.data))) {
                    return '<span class="null-value">[BINARY]</span>';
                }
                try {
                    return highlightText(JSON.stringify(value), searchTerm);
                } catch {
                    return '<span class="null-value">[Object]</span>';
                }
            }
            return highlightText(String(value), searchTerm);
        }

        function highlightText(text, searchTerm) {
            if (!searchTerm) {
                return escapeHtml(text);
            }
            const escaped = escapeHtml(text);
            const searchLower = searchTerm.toLowerCase();
            const textLower = text.toLowerCase();

            let result = '';
            let lastIndex = 0;
            let index = textLower.indexOf(searchLower);

            while (index !== -1) {
                result += escapeHtml(text.slice(lastIndex, index));
                result += '<span class="highlight">' + escapeHtml(text.slice(index, index + searchTerm.length)) + '</span>';
                lastIndex = index + searchTerm.length;
                index = textLower.indexOf(searchLower, lastIndex);
            }
            result += escapeHtml(text.slice(lastIndex));
            return result;
        }

        function rowMatchesSearch(row, searchTerm) {
            if (!searchTerm) return true;
            const searchLower = searchTerm.toLowerCase();
            return row.some(cell => {
                if (cell === null || cell === undefined) return false;
                return String(cell).toLowerCase().includes(searchLower);
            });
        }

        function handleColumnClick(columnName) {
            if (currentSortColumn === columnName) {
                if (currentSortDirection === 'ASC') {
                    currentSortDirection = 'DESC';
                } else if (currentSortDirection === 'DESC') {
                    currentSortDirection = null;
                    currentSortColumn = null;
                }
            } else {
                currentSortColumn = columnName;
                currentSortDirection = 'ASC';
            }

            if (isQueryMode) {
                // Query mode: local (client-side) sorting
                sortAndRenderLocally();
            } else {
                // Table mode: server-side sorting
                vscode.postMessage({
                    command: 'sort',
                    column: currentSortColumn,
                    direction: currentSortDirection
                });
            }
        }

        function sortAndRenderLocally() {
            if (!currentSortColumn || !currentSortDirection) {
                // No sorting - restore original order
                allRows = originalRows.map(row => [...row]);
                renderFilteredTable(searchInput.value.trim());
                return;
            }

            const colIndex = allColumns.indexOf(currentSortColumn);
            if (colIndex === -1) return;

            // Create a copy to sort (don't modify original)
            allRows = originalRows.map(row => [...row]);

            // Sort allRows
            allRows.sort((a, b) => {
                const aVal = a[colIndex];
                const bVal = b[colIndex];

                // Handle nulls: nulls always go last
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                // Compare values
                let cmp = 0;
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    cmp = aVal - bVal;
                } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                    cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
                } else {
                    cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
                }

                return currentSortDirection === 'DESC' ? -cmp : cmp;
            });

            renderFilteredTable(searchInput.value.trim());
        }

        function getSortArrows(columnName) {
            const isAscActive = currentSortColumn === columnName && currentSortDirection === 'ASC';
            const isDescActive = currentSortColumn === columnName && currentSortDirection === 'DESC';
            return '<span class="sort-arrows">' +
                '<span class="sort-arrow' + (isAscActive ? ' active' : '') + '">▲</span>' +
                '<span class="sort-arrow' + (isDescActive ? ' active' : '') + '">▼</span>' +
                '</span>';
        }

        function renderTable(columns, rows, searchTerm = '') {
            allColumns = columns;
            originalRows = rows.map(row => [...row]); // Deep copy for original order
            allRows = rows;
            totalRows = rows.length;

            if (rows.length === 0) {
                rowCountDiv.textContent = '0 rows';
                contentDiv.innerHTML = '<div class="empty-state">Query returned 0 rows</div>';
                searchInput.disabled = true;
                return;
            }

            searchInput.disabled = false;
            renderFilteredTable(searchTerm);
        }

        function renderFilteredTable(searchTerm = '') {
            const filteredRows = allRows.filter(row => rowMatchesSearch(row, searchTerm));
            // Build index map from filtered rows back to allRows
            const filteredIndices = [];
            for (let i = 0; i < allRows.length; i++) {
                if (rowMatchesSearch(allRows[i], searchTerm)) {
                    filteredIndices.push(i);
                }
            }

            if (filteredRows.length === 0 && searchTerm) {
                rowCountDiv.textContent = '0 of ' + totalRows + ' rows';
                contentDiv.innerHTML = '<div class="no-results">No matching rows</div>';
                return;
            }

            const limitNote = totalRows >= 100 && !isQueryMode ? ' (limited to 100)' : '';
            if (searchTerm) {
                rowCountDiv.textContent = filteredRows.length + ' of ' + totalRows + ' rows' + limitNote;
            } else {
                rowCountDiv.textContent = totalRows + ' row' + (totalRows === 1 ? '' : 's') + limitNote;
            }

            const showGutter = isEditable && !isReadOnly;
            const sortTooltip = isQueryMode ? 'Click to sort locally' : 'Click to sort';
            let html = '<table><thead><tr>';
            if (showGutter) {
                html += '<th class="gutter-col"></th>';
            }
            allColumns.forEach((col, i) => {
                const width = columnWidths[i] || 150;
                const sortArrows = getSortArrows(col);
                html += '<th style="width: ' + width + 'px; max-width: ' + width + 'px; position: relative;" data-column="' + escapeHtml(col) + '" title="' + sortTooltip + '">' +
                    '<span class="th-content">' +
                    '<span class="column-name">' + escapeHtml(col) + '</span>' +
                    sortArrows +
                    '</span>' +
                    '<div class="resize-handle" data-col="' + i + '"></div></th>';
            });
            html += '</tr></thead><tbody>';

            filteredRows.forEach((row, fi) => {
                const realIndex = filteredIndices[fi];
                html += '<tr data-row="' + realIndex + '">';
                if (showGutter) {
                    html += '<td class="gutter-col"><div class="gutter-actions">' +
                        '<button class="gutter-btn delete-btn" data-row="' + realIndex + '" title="Delete row">&#128465;</button>' +
                        '<button class="gutter-btn clone-btn" data-row="' + realIndex + '" title="Clone row">&#128203;</button>' +
                        '</div></td>';
                }
                row.forEach((cell, i) => {
                    const width = columnWidths[i] || 150;
                    html += '<td style="max-width: ' + width + 'px;">' + formatCellContent(cell, i, realIndex, searchTerm) + '</td>';
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
            contentDiv.innerHTML = html;

            setupColumnResizing();
            setupColumnSorting();
            setupEditHandlers();
        }

        function setupEditHandlers() {
            // Edit icon click
            contentDiv.querySelectorAll('.edit-icon').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = parseInt(icon.getAttribute('data-row'));
                    const col = parseInt(icon.getAttribute('data-col'));
                    enterEditMode(row, col);
                });
            });
            // Gutter delete
            contentDiv.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rowIdx = parseInt(btn.getAttribute('data-row'));
                    const pks = getPrimaryKeyValues(rowIdx);
                    if (pks) {
                        vscode.postMessage({ command: 'deleteRow', primaryKeys: pks, rowIndex: rowIdx });
                    }
                });
            });
            // Gutter clone
            contentDiv.querySelectorAll('.clone-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rowIdx = parseInt(btn.getAttribute('data-row'));
                    const pks = getPrimaryKeyValues(rowIdx);
                    const vals = getRowValues(rowIdx);
                    if (pks) {
                        vscode.postMessage({ command: 'cloneRow', values: vals, primaryKeys: pks });
                    }
                });
            });
        }

        function setupColumnSorting() {
            const headers = contentDiv.querySelectorAll('th[data-column]');
            headers.forEach((th) => {
                th.addEventListener('click', function(e) {
                    if (e.target.classList.contains('resize-handle')) {
                        return;
                    }
                    const columnName = this.getAttribute('data-column');
                    handleColumnClick(columnName);
                });
            });
        }

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            renderFilteredTable(searchTerm);
        });

        function setupColumnResizing() {
            const handles = contentDiv.querySelectorAll('.resize-handle');

            handles.forEach((handle) => {
                handle.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const colIndex = parseInt(this.getAttribute('data-col'));
                    const th = this.parentElement;
                    const startX = e.clientX;
                    const startWidth = th.offsetWidth;

                    this.classList.add('active');
                    document.body.classList.add('resizing');

                    const onMouseMove = (e) => {
                        const diff = e.clientX - startX;
                        const newWidth = Math.max(50, startWidth + diff);
                        th.style.width = newWidth + 'px';
                        th.style.maxWidth = newWidth + 'px';
                        columnWidths[colIndex] = newWidth;
                        // Update td max-width for this column
                        const rows = contentDiv.querySelectorAll('tbody tr');
                        rows.forEach(row => {
                            const td = row.children[colIndex];
                            if (td) td.style.maxWidth = newWidth + 'px';
                        });
                    };

                    const onMouseUp = () => {
                        this.classList.remove('active');
                        document.body.classList.remove('resizing');
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loading':
                    rowCountDiv.textContent = '';
                    executionTimeDiv.textContent = '';
                    truncationNotice.classList.add('hidden');
                    contentDiv.innerHTML = '<div class="loading">' + (message.message || 'Loading data...') + '</div>';
                    currentQuery = '';
                    queryWrapper.classList.add('hidden');
                    queryWrapper.classList.remove('expanded');
                    break;
                case 'data':
                    if (message.sort) {
                        currentSortColumn = message.sort.column;
                        currentSortDirection = message.sort.direction;
                    } else {
                        currentSortColumn = null;
                        currentSortDirection = null;
                    }
                    currentQuery = message.query || '';
                    queryWrapper.classList.remove('expanded');
                    updateQueryDisplay();
                    if (message.executionTime !== undefined) {
                        executionTimeDiv.textContent = message.executionTime + 'ms';
                    }
                    if (message.truncated) {
                        truncationNotice.classList.remove('hidden');
                    } else {
                        truncationNotice.classList.add('hidden');
                    }
                    // Process editability info
                    isEditable = message.editable || false;
                    identifyingColumns = message.identifyingColumns || [];
                    columnMetadata = message.columnMetadata || [];
                    editTableName = message.tableName || '';
                    isReadOnly = true; // Reset to locked on new data
                    editingCell = null;
                    if (!isEditable && message.editabilityReason) {
                        editabilityHint.textContent = message.editabilityReason;
                    } else {
                        editabilityHint.textContent = '';
                    }
                    lockToggle.innerHTML = '&#128274; Read-only';
                    showEditControls();
                    renderTable(message.columns, message.rows);
                    break;
                case 'nonSelectResult':
                    currentQuery = message.query || '';
                    queryWrapper.classList.remove('expanded');
                    updateQueryDisplay();
                    executionTimeDiv.textContent = message.executionTime + 'ms';
                    rowCountDiv.textContent = message.affectedRows + ' affected';
                    truncationNotice.classList.add('hidden');
                    contentDiv.innerHTML = '<div class="success-message">Query executed successfully. ' +
                        message.affectedRows + ' row' + (message.affectedRows === 1 ? '' : 's') + ' affected.</div>';
                    searchInput.disabled = true;
                    break;
                case 'error':
                    rowCountDiv.textContent = '';
                    executionTimeDiv.textContent = '';
                    currentQuery = '';
                    queryWrapper.classList.add('hidden');
                    queryWrapper.classList.remove('expanded');
                    truncationNotice.classList.add('hidden');
                    contentDiv.innerHTML = '<div class="error"><span class="error-icon">&#10060;</span> ' + escapeHtml(message.message) + '</div>';
                    searchInput.disabled = true;
                    break;
                case 'cancelled':
                    rowCountDiv.textContent = '';
                    executionTimeDiv.textContent = '';
                    truncationNotice.classList.add('hidden');
                    contentDiv.innerHTML = '<div class="cancelled-message">Query cancelled</div>';
                    searchInput.disabled = true;
                    break;
                case 'cellUpdateResult': {
                    const ri = message.rowIndex;
                    const ci = allColumns.indexOf(message.column);
                    if (message.success) {
                        if (message.updatedRow && allRows[ri]) {
                            allRows[ri] = message.updatedRow;
                            originalRows[ri] = [...message.updatedRow];
                        }
                        const td = getCell(ri, ci);
                        if (td) {
                            td.classList.remove('cell-editing');
                            td.innerHTML = formatCellContent(allRows[ri][ci], ci, ri, searchInput.value.trim());
                        }
                        flashCell(ri, ci, 'success');
                        setupEditHandlers();
                    } else {
                        // Revert cell
                        const td = getCell(ri, ci);
                        if (td) {
                            td.classList.remove('cell-editing');
                            td.innerHTML = formatCellContent(allRows[ri][ci], ci, ri, searchInput.value.trim());
                        }
                        flashCell(ri, ci, 'error');
                        if (message.error) {
                            td && (td.title = message.error);
                        }
                        setupEditHandlers();
                    }
                    break;
                }
                case 'deleteRowResult': {
                    const dri = message.rowIndex;
                    if (message.success) {
                        // Remove row with animation
                        const table = contentDiv.querySelector('table');
                        if (table) {
                            const rows = table.querySelectorAll('tbody tr');
                            for (const tr of rows) {
                                if (parseInt(tr.getAttribute('data-row')) === dri) {
                                    tr.classList.add('fade-out');
                                    setTimeout(() => {
                                        allRows.splice(dri, 1);
                                        originalRows.splice(dri, 1);
                                        totalRows = allRows.length;
                                        renderFilteredTable(searchInput.value.trim());
                                    }, 300);
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
                case 'insertRowResult': {
                    if (message.success && message.newRow) {
                        allRows.push(message.newRow);
                        originalRows.push([...message.newRow]);
                        totalRows = allRows.length;
                        renderFilteredTable(searchInput.value.trim());
                        // Flash last row
                        const lastIdx = allRows.length - 1;
                        if (allColumns.length > 0) {
                            flashCell(lastIdx, 0, 'success');
                        }
                    }
                    break;
                }
            }
        });
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

/**
 * Builds editability info from column metadata.
 * Precedence: PK columns > first UNIQUE NOT NULL constraint > non-editable.
 */
export function buildEditabilityInfo(
    tableName: string,
    columns: ColumnInfo[],
    tableType: 'TABLE' | 'VIEW',
    resultColumns?: string[],
): EditabilityInfo {
    if (tableType === 'VIEW') {
        return { editable: false, tableName, identifyingColumns: [], columnMetadata: columns.map(c => ({ name: c.name, dataType: c.dataType, nullable: c.nullable, keyType: c.keyType })), reason: 'Editing unavailable: views are not editable' };
    }

    // Find PK columns first
    const pkColumns = columns.filter(c => c.keyType === 'PRIMARY').map(c => c.name);
    // Fall back to UNIQUE NOT NULL columns
    const uniqueColumns = columns.filter(c => c.keyType === 'UNIQUE').map(c => c.name);

    let identifyingColumns: string[];
    if (pkColumns.length > 0) {
        identifyingColumns = pkColumns;
    } else if (uniqueColumns.length > 0) {
        identifyingColumns = uniqueColumns;
    } else {
        return { editable: false, tableName, identifyingColumns: [], columnMetadata: columns.map(c => ({ name: c.name, dataType: c.dataType, nullable: c.nullable, keyType: c.keyType })), reason: 'Editing unavailable: no primary key or unique constraint' };
    }

    // If result columns provided, check all identifying columns are present
    if (resultColumns) {
        const resultColSet = new Set(resultColumns);
        const missingCols = identifyingColumns.filter(c => !resultColSet.has(c));
        if (missingCols.length > 0) {
            return { editable: false, tableName, identifyingColumns, columnMetadata: columns.map(c => ({ name: c.name, dataType: c.dataType, nullable: c.nullable, keyType: c.keyType })), reason: 'Editing unavailable: identifying columns missing from result set' };
        }
    }

    return {
        editable: true,
        tableName,
        identifyingColumns,
        columnMetadata: columns.map(c => ({ name: c.name, dataType: c.dataType, nullable: c.nullable, keyType: c.keyType })),
    };
}
