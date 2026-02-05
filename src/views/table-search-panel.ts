import * as vscode from 'vscode';
import { ConnectionConfig } from '../models/connection';
import { TableInfo } from '../models/table';

interface SearchMessage {
    command: 'search' | 'select' | 'close' | 'toggleStar';
    query?: string;
    tableIndex?: number;
    tableName?: string;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class TableSearchPanel {
    private static currentPanel: TableSearchPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private allTables: TableInfo[] = [];
    private starredTables: Set<string>;
    private lastQuery: string = '';

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly connection: ConnectionConfig,
        private readonly getTables: () => Promise<TableInfo[]>,
        private readonly onSelect: (table: TableInfo) => void,
        private readonly getStarredTables: () => Set<string>,
        private readonly onToggleStar: (tableName: string, starred: boolean) => Promise<void>,
    ) {
        this.starredTables = getStarredTables();
        this.panel = panel;
        this.panel.webview.html = this.getHtml(panel.webview);

        this.panel.webview.onDidReceiveMessage(
            async (message: SearchMessage) => {
                switch (message.command) {
                    case 'search':
                        if (message.query !== undefined) {
                            this.performSearch(message.query);
                        }
                        break;
                    case 'select':
                        if (message.tableIndex !== undefined && this.allTables[message.tableIndex]) {
                            this.onSelect(this.allTables[message.tableIndex]);
                            this.panel.dispose();
                        }
                        break;
                    case 'close':
                        this.panel.dispose();
                        break;
                    case 'toggleStar':
                        if (message.tableName) {
                            const isCurrentlyStarred = this.starredTables.has(message.tableName);
                            await this.onToggleStar(message.tableName, !isCurrentlyStarred);
                            this.starredTables = this.getStarredTables();
                            this.performSearch(this.lastQuery);
                        }
                        break;
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.loadTables();
    }

    static show(
        extensionUri: vscode.Uri,
        connection: ConnectionConfig,
        getTables: () => Promise<TableInfo[]>,
        onSelect: (table: TableInfo) => void,
        getStarredTables: () => Set<string>,
        onToggleStar: (tableName: string, starred: boolean) => Promise<void>,
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (TableSearchPanel.currentPanel) {
            TableSearchPanel.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dboolyTableSearch',
            `Search Tables - ${connection.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
            }
        );

        TableSearchPanel.currentPanel = new TableSearchPanel(
            panel,
            connection,
            getTables,
            onSelect,
            getStarredTables,
            onToggleStar
        );
    }

    private async loadTables(): Promise<void> {
        this.panel.webview.postMessage({ command: 'loading' });

        try {
            this.allTables = await this.getTables();
            this.performSearch('');
        } catch {
            this.panel.webview.postMessage({ command: 'error', message: 'Failed to load tables' });
        }
    }

    private performSearch(query: string): void {
        this.lastQuery = query;
        const lowerQuery = query.toLowerCase().trim();

        let tables = this.allTables;
        if (lowerQuery) {
            tables = this.allTables.filter(table =>
                table.name.toLowerCase().includes(lowerQuery)
            );
        }

        // Sort starred first, then alphabetically
        const sorted = [...tables].sort((a, b) => {
            const aStarred = this.starredTables.has(a.name);
            const bStarred = this.starredTables.has(b.name);
            if (aStarred && !bStarred) return -1;
            if (!aStarred && bStarred) return 1;
            return a.name.localeCompare(b.name);
        });

        this.sendResults(sorted);
    }

    private sendResults(tables: TableInfo[]): void {
        const data = tables.map(t => ({
            index: this.allTables.indexOf(t),
            tableName: t.name,
            tableType: t.type,
            starred: this.starredTables.has(t.name),
        }));
        this.panel.webview.postMessage({ command: 'results', data });
    }

    private dispose(): void {
        TableSearchPanel.currentPanel = undefined;
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

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Search Tables - ${this.connection.name}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            max-width: 600px;
            margin: 0 auto;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 6px;
            font-weight: 500;
        }
        .connection-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }
        .search-container {
            position: relative;
            margin-bottom: 16px;
        }
        .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--vscode-input-placeholderForeground);
        }
        input[type="text"] {
            width: 100%;
            padding: 10px 12px 10px 36px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 14px;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        input[type="text"]::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .results {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
            border-radius: 4px;
        }
        .result-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
        }
        .result-item:last-child {
            border-bottom: none;
        }
        .result-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .result-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .table-icon {
            margin-right: 10px;
            font-size: 16px;
        }
        .table-info {
            flex: 1;
            min-width: 0;
        }
        .table-name {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .table-type {
            display: inline-block;
            padding: 1px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 11px;
            margin-left: 8px;
        }
        .empty-state {
            padding: 40px 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .loading {
            padding: 40px 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .error {
            padding: 40px 20px;
            text-align: center;
            color: var(--vscode-errorForeground);
        }
        .result-count {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        kbd {
            background-color: var(--vscode-keybindingLabel-background);
            color: var(--vscode-keybindingLabel-foreground);
            border: 1px solid var(--vscode-keybindingLabel-border);
            border-radius: 3px;
            padding: 2px 6px;
            font-size: 11px;
            font-family: inherit;
        }
        .keyboard-hint {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 12px;
            text-align: center;
        }
        .star-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 4px 8px;
            margin-left: 8px;
            opacity: 0.7;
            transition: opacity 0.15s, color 0.15s;
            color: var(--vscode-foreground);
            text-shadow: 0 0 1px var(--vscode-foreground);
        }
        .star-btn:hover {
            opacity: 1;
            color: #f5c842;
        }
        .star-btn.starred {
            opacity: 1;
            color: #f5c842;
            text-shadow: none;
        }
    </style>
</head>
<body>
    <h1>Search Tables</h1>
    <div class="connection-info">${this.connection.name} - ${this.connection.host}:${this.connection.port}/${this.connection.database}</div>

    <div class="search-container">
        <span class="search-icon">&#128269;</span>
        <input type="text" id="searchInput" placeholder="Type to search tables..." autofocus>
    </div>

    <div id="resultCount" class="result-count"></div>
    <div id="results" class="results">
        <div class="loading">Loading tables...</div>
    </div>

    <div class="keyboard-hint">
        <kbd>↑</kbd> <kbd>↓</kbd> to navigate &nbsp;·&nbsp; <kbd>Enter</kbd> to select &nbsp;·&nbsp; <kbd>Esc</kbd> to close
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const searchInput = document.getElementById('searchInput');
        const resultsDiv = document.getElementById('results');
        const resultCountDiv = document.getElementById('resultCount');
        let currentResults = [];
        let selectedIndex = 0;

        searchInput.addEventListener('input', () => {
            vscode.postMessage({ command: 'search', query: searchInput.value });
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectPrev();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                selectCurrent();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                vscode.postMessage({ command: 'close' });
            }
        });

        function selectNext() {
            if (selectedIndex < currentResults.length - 1) {
                selectedIndex++;
                updateSelection();
            }
        }

        function selectPrev() {
            if (selectedIndex > 0) {
                selectedIndex--;
                updateSelection();
            }
        }

        function selectCurrent() {
            if (currentResults.length > 0) {
                vscode.postMessage({ command: 'select', tableIndex: currentResults[selectedIndex].index });
            }
        }

        function updateSelection() {
            const items = resultsDiv.querySelectorAll('.result-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === selectedIndex);
            });
            if (items[selectedIndex]) {
                items[selectedIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        function renderResults(results) {
            currentResults = results;
            selectedIndex = 0;

            if (results.length === 0) {
                resultsDiv.innerHTML = '<div class="empty-state">No tables found</div>';
                resultCountDiv.textContent = '';
                return;
            }

            resultCountDiv.textContent = results.length + ' table' + (results.length === 1 ? '' : 's');

            resultsDiv.innerHTML = results.map((r, i) =>
                '<div class="result-item' + (i === 0 ? ' selected' : '') + '" data-index="' + r.index + '" data-name="' + escapeHtml(r.tableName) + '">' +
                    '<span class="table-icon">' + (r.tableType === 'VIEW' ? '&#128203;' : '&#128196;') + '</span>' +
                    '<div class="table-info">' +
                        '<div class="table-name">' + escapeHtml(r.tableName) +
                            '<span class="table-type">' + r.tableType + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button class="star-btn' + (r.starred ? ' starred' : '') + '" title="' + (r.starred ? 'Unstar' : 'Star') + ' table">' +
                        (r.starred ? '★' : '☆') +
                    '</button>' +
                '</div>'
            ).join('');

            resultsDiv.querySelectorAll('.result-item').forEach((item, i) => {
                const tableInfo = item.querySelector('.table-info');
                tableInfo.addEventListener('click', () => {
                    selectedIndex = i;
                    updateSelection();
                    selectCurrent();
                });

                const starBtn = item.querySelector('.star-btn');
                starBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tableName = item.getAttribute('data-name');
                    vscode.postMessage({ command: 'toggleStar', tableName });
                });
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loading':
                    resultsDiv.innerHTML = '<div class="loading">Loading tables...</div>';
                    resultCountDiv.textContent = '';
                    break;
                case 'results':
                    renderResults(message.data);
                    break;
                case 'error':
                    resultsDiv.innerHTML = '<div class="error">' + escapeHtml(message.message) + '</div>';
                    resultCountDiv.textContent = '';
                    break;
            }
        });

        // Focus input on load
        searchInput.focus();
    </script>
</body>
</html>`;
    }
}
