import * as vscode from 'vscode';
import { ConnectionConfig, isMySQLConnection } from '../models/connection';
import { TableInfo } from '../models/table';
import { QueryResult, SortOptions, SortDirection, QueryExecutionResult } from '../providers/schema-provider';

function getConnectionSubtitle(connection: ConnectionConfig): string {
    if (isMySQLConnection(connection)) {
        return `${connection.name} - ${connection.host}:${connection.port}/${connection.database}`;
    }
    return `${connection.name} - ${connection.filePath}`;
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

    private setupMessageHandler(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'sort' && this.getData && this.config.mode === 'table') {
                    // Table mode: server-side sorting
                    this.sortColumn = message.column;
                    this.sortDirection = message.direction;
                    await this.loadData(true);
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
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (TableDataPanel.instance) {
            TableDataPanel.instance.panel.reveal(column);
            TableDataPanel.instance.updateForTableData(connection, table, getData);
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
            subtitle: getConnectionSubtitle(connection),
            mode: 'table',
        };

        TableDataPanel.instance = new TableDataPanel(panel, config);
        TableDataPanel.instance.getData = getData;
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
        this.panel.webview.postMessage({
            command: 'loading',
            message: `Executing query on ${connectionName}...`,
        });
    }

    showResult(result: QueryExecutionResult): void {
        if (result.type === 'select' && result.columns && result.rows) {
            this.panel.webview.postMessage({
                command: 'data',
                columns: result.columns,
                rows: result.rows,
                query: result.query,
                executionTime: result.executionTimeMs,
                truncated: result.truncated,
                affectedRows: null,
            });
        } else {
            // INSERT/UPDATE/DELETE result
            this.panel.webview.postMessage({
                command: 'nonSelectResult',
                query: result.query,
                affectedRows: result.affectedRows ?? 0,
                executionTime: result.executionTimeMs,
            });
        }
    }

    showError(message: string): void {
        this.panel.webview.postMessage({ command: 'error', message });
    }

    showCancelled(): void {
        this.panel.webview.postMessage({ command: 'cancelled' });
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
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    private updateForTableData(
        connection: ConnectionConfig,
        table: TableInfo,
        getData: (sort?: SortOptions) => Promise<QueryResult>,
    ): void {
        this.config = {
            title: table.name,
            subtitle: getConnectionSubtitle(connection),
            mode: 'table',
        };
        this.getData = getData;
        this.sortColumn = null;
        this.sortDirection = null;
        this.panel.title = `${table.name} - ${connection.name}`;
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.loadData();
    }

    private async loadData(skipLoadingState = false): Promise<void> {
        if (!this.getData) return;

        if (!skipLoadingState) {
            this.panel.webview.postMessage({ command: 'loading' });
        }

        try {
            const sort = this.sortColumn && this.sortDirection
                ? { column: this.sortColumn, direction: this.sortDirection }
                : undefined;
            const result = await this.getData(sort);
            this.panel.webview.postMessage({
                command: 'data',
                columns: result.columns,
                rows: result.rows,
                query: result.query,
                sort: sort ? { column: sort.column, direction: sort.direction } : null,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load data';
            this.panel.webview.postMessage({ command: 'error', message });
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

        let allColumns = [];
        let allRows = [];
        let originalRows = []; // Keep original order for unsort
        let currentQuery = ''; // Store original query for expanded view
        let totalRows = 0;
        let columnWidths = {};
        let currentSortColumn = null;
        let currentSortDirection = null;

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

            const sortTooltip = isQueryMode ? 'Click to sort locally' : 'Click to sort';
            let html = '<table><thead><tr>';
            allColumns.forEach((col, i) => {
                const width = columnWidths[i] || 150;
                const sortArrows = getSortArrows(col);
                html += '<th style="width: ' + width + 'px; position: relative;" data-column="' + escapeHtml(col) + '" title="' + sortTooltip + '">' +
                    '<span class="th-content">' +
                    '<span class="column-name">' + escapeHtml(col) + '</span>' +
                    sortArrows +
                    '</span>' +
                    '<div class="resize-handle" data-col="' + i + '"></div></th>';
            });
            html += '</tr></thead><tbody>';

            filteredRows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    html += '<td>' + formatValue(cell, searchTerm) + '</td>';
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
            contentDiv.innerHTML = html;

            setupColumnResizing();
            setupColumnSorting();
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
                        columnWidths[colIndex] = newWidth;
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
