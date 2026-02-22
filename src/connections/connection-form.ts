import * as vscode from 'vscode';
import { ConnectionScope, MySQLConnectionConfigWithPassword, SQLiteConnectionConfigWithPassword, PostgreSQLConnectionConfigWithPassword } from '../models/connection';

type MySQLFormData = Omit<MySQLConnectionConfigWithPassword, 'id'>;
type SQLiteFormData = Omit<SQLiteConnectionConfigWithPassword, 'id'>;
type PostgreSQLFormData = Omit<PostgreSQLConnectionConfigWithPassword, 'id'>;
type FormData = MySQLFormData | SQLiteFormData | PostgreSQLFormData;

interface FormMessage {
    command: 'submit' | 'test' | 'cancel' | 'browseFile';
    data?: FormData;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class ConnectionFormPanel {
    private static currentPanel: ConnectionFormPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly defaults: Partial<FormData> | undefined,
        private readonly title: string,
        private readonly hasProjectOpen: boolean,
        private readonly onSubmit: (data: FormData) => Promise<void>,
        private readonly onTest: (data: FormData) => Promise<{ success: boolean; message: string }>
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml(panel.webview);

        this.panel.webview.onDidReceiveMessage(
            async (message: FormMessage) => {
                switch (message.command) {
                    case 'submit':
                        if (message.data) {
                            try {
                                await this.onSubmit(message.data);
                                this.panel.dispose();
                            } catch (error) {
                                const msg = error instanceof Error ? error.message : 'Unknown error';
                                this.panel.webview.postMessage({ command: 'error', message: msg });
                            }
                        }
                        break;
                    case 'test':
                        if (message.data) {
                            const result = await this.onTest(message.data);
                            this.panel.webview.postMessage({ command: 'testResult', ...result });
                        }
                        break;
                    case 'cancel':
                        this.panel.dispose();
                        break;
                    case 'browseFile':
                        await this.handleBrowseFile();
                        break;
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    private async handleBrowseFile(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'SQLite Databases': ['db', 'sqlite', 'sqlite3', 'db3'],
                'All Files': ['*']
            },
            title: 'Select SQLite Database File'
        });

        if (fileUri && fileUri[0]) {
            this.panel.webview.postMessage({
                command: 'setFilePath',
                filePath: fileUri[0].fsPath
            });
        }
    }

    static show(
        extensionUri: vscode.Uri,
        defaults: Partial<FormData> | undefined,
        title: string,
        hasProjectOpen: boolean,
        onSubmit: (data: FormData) => Promise<void>,
        onTest: (data: FormData) => Promise<{ success: boolean; message: string }>
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (ConnectionFormPanel.currentPanel) {
            ConnectionFormPanel.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dboolyConnectionForm',
            title,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        ConnectionFormPanel.currentPanel = new ConnectionFormPanel(panel, defaults, title, hasProjectOpen, onSubmit, onTest);
    }

    private dispose(): void {
        ConnectionFormPanel.currentPanel = undefined;
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
        const d = this.defaults || {};
        const defaultType = 'type' in d ? d.type : 'mysql';
        const defaultFilePath = 'filePath' in d ? (d as SQLiteFormData).filePath : '';
        const defaultHost = 'host' in d ? (d as MySQLFormData).host : 'localhost';
        const defaultPort = 'port' in d ? (d as MySQLFormData).port : (defaultType === 'postgresql' ? 5432 : 3306);
        const defaultDatabase = 'database' in d ? (d as MySQLFormData).database : '';
        const defaultUsername = 'username' in d ? (d as MySQLFormData).username : '';
        const defaultPassword = 'password' in d ? (d as MySQLFormData).password : '';
        const defaultSsl = 'ssl' in d ? (d as PostgreSQLFormData).ssl : false;
        const defaultScope: ConnectionScope = 'scope' in d ? (d as { scope: ConnectionScope }).scope : 'global';
        const projectDisabled = !this.hasProjectOpen;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>${this.title}</title>
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
            padding: 20px;
            max-width: 500px;
            margin: 0 auto;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .form-group {
            margin-bottom: 16px;
        }
        label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
        }
        input, select {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: inherit;
        }
        input:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .row {
            display: flex;
            gap: 12px;
        }
        .row .form-group {
            flex: 1;
        }
        .row .form-group.small {
            flex: 0 0 100px;
        }
        .input-with-button {
            display: flex;
            gap: 8px;
        }
        .input-with-button input {
            flex: 1;
        }
        .input-with-button button {
            flex-shrink: 0;
        }
        .buttons {
            display: flex;
            gap: 10px;
            margin-top: 24px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: inherit;
        }
        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .message {
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            display: none;
            font-size: 13px;
            line-height: 1.4;
        }
        .message.success {
            background-color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
            color: #fff;
            display: block;
        }
        .message.error {
            background-color: var(--vscode-notificationsErrorIcon-foreground, #f14c4c);
            color: #fff;
            display: block;
        }
        .message.info {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            display: block;
        }
        .required::after {
            content: ' *';
            color: var(--vscode-errorForeground);
        }
        .hidden {
            display: none !important;
        }
        .radio-group {
            display: flex;
            gap: 16px;
        }
        .radio-group label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: normal;
            cursor: pointer;
        }
        .radio-group label.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .radio-group input[type="radio"] {
            width: auto;
            margin: 0;
        }
        .scope-note {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <h1>${this.title}</h1>

    <div id="message" class="message"></div>

    <form id="connectionForm">
        <div class="form-group">
            <label for="name" class="required">Connection Name</label>
            <input type="text" id="name" name="name" value="${d.name || ''}" required placeholder="My Database">
        </div>

        <div class="form-group">
            <label>Connection Scope</label>
            <div class="radio-group">
                <label${defaultScope === 'global' ? '' : ''}>
                    <input type="radio" name="scope" value="global" ${defaultScope === 'global' ? 'checked' : ''}>
                    Global
                </label>
                <label${projectDisabled ? ' class="disabled"' : ''}>
                    <input type="radio" name="scope" value="project" ${defaultScope === 'project' ? 'checked' : ''} ${projectDisabled ? 'disabled' : ''}>
                    Project
                </label>
            </div>
            ${projectDisabled ? '<div class="scope-note">Project connections require an open project</div>' : ''}
        </div>

        <div class="form-group">
            <label for="type">Database Type</label>
            <select id="type" name="type">
                <option value="mysql" ${defaultType === 'mysql' ? 'selected' : ''}>MySQL</option>
                <option value="postgresql" ${defaultType === 'postgresql' ? 'selected' : ''}>PostgreSQL</option>
                <option value="sqlite" ${defaultType === 'sqlite' ? 'selected' : ''}>SQLite</option>
            </select>
        </div>

        <!-- SQLite fields -->
        <div id="sqliteFields" class="${defaultType === 'sqlite' ? '' : 'hidden'}">
            <div class="form-group">
                <label for="filePath" class="required">Database File</label>
                <div class="input-with-button">
                    <input type="text" id="filePath" name="filePath" value="${defaultFilePath}" placeholder="/path/to/database.sqlite" required>
                    <button type="button" class="secondary" id="browseBtn">Browse...</button>
                </div>
            </div>
        </div>

        <!-- Server fields (MySQL / PostgreSQL) -->
        <div id="serverFields" class="${defaultType !== 'sqlite' ? '' : 'hidden'}">
            <div class="row">
                <div class="form-group">
                    <label for="host" class="required">Host</label>
                    <input type="text" id="host" name="host" value="${defaultHost}" placeholder="localhost">
                </div>
                <div class="form-group small">
                    <label for="port" class="required">Port</label>
                    <input type="number" id="port" name="port" value="${defaultPort}" min="1" max="65535">
                </div>
            </div>

            <div class="form-group">
                <label for="database" class="required">Database Name</label>
                <input type="text" id="database" name="database" value="${defaultDatabase}" placeholder="mydb">
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="username" class="required">Username</label>
                    <input type="text" id="username" name="username" value="${defaultUsername}" placeholder="root">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" value="${defaultPassword}" placeholder="••••••••">
                </div>
            </div>

            <!-- SSL toggle (PostgreSQL only) -->
            <div id="sslField" class="${defaultType === 'postgresql' ? '' : 'hidden'}">
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="ssl" name="ssl" ${defaultSsl ? 'checked' : ''}>
                        Use SSL
                    </label>
                </div>
            </div>
        </div>

        <div class="buttons">
            <button type="submit" class="primary">Save</button>
            <button type="button" class="secondary" id="testBtn">Test Connection</button>
            <button type="button" class="secondary" id="cancelBtn">Cancel</button>
        </div>
    </form>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('connectionForm');
        const messageDiv = document.getElementById('message');
        const testBtn = document.getElementById('testBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const browseBtn = document.getElementById('browseBtn');
        const typeSelect = document.getElementById('type');
        const serverFields = document.getElementById('serverFields');
        const sqliteFields = document.getElementById('sqliteFields');
        const sslField = document.getElementById('sslField');
        const portDefaults = { mysql: 3306, postgresql: 5432 };

        function updateFieldVisibility() {
            const type = typeSelect.value;
            if (type === 'sqlite') {
                serverFields.classList.add('hidden');
                sqliteFields.classList.remove('hidden');
                sslField.classList.add('hidden');
                // Update required attributes
                document.getElementById('filePath').required = true;
                document.getElementById('host').required = false;
                document.getElementById('port').required = false;
                document.getElementById('database').required = false;
                document.getElementById('username').required = false;
            } else {
                serverFields.classList.remove('hidden');
                sqliteFields.classList.add('hidden');
                // Update required attributes
                document.getElementById('filePath').required = false;
                document.getElementById('host').required = true;
                document.getElementById('port').required = true;
                document.getElementById('database').required = true;
                document.getElementById('username').required = true;
                // Show SSL toggle only for PostgreSQL
                if (type === 'postgresql') {
                    sslField.classList.remove('hidden');
                } else {
                    sslField.classList.add('hidden');
                }
            }
        }

        typeSelect.addEventListener('change', function() {
            const newType = typeSelect.value;
            // Update default port when switching between server types
            if (portDefaults[newType]) {
                const portInput = document.getElementById('port');
                const currentPort = parseInt(portInput.value, 10);
                // Only change port if it matches the other type's default
                if (Object.values(portDefaults).includes(currentPort) || isNaN(currentPort)) {
                    portInput.value = portDefaults[newType];
                }
            }
            updateFieldVisibility();
        });

        function getFormData() {
            const type = typeSelect.value;
            const scope = document.querySelector('input[name="scope"]:checked').value;

            if (type === 'sqlite') {
                return {
                    name: document.getElementById('name').value.trim(),
                    type: 'sqlite',
                    scope: scope,
                    filePath: document.getElementById('filePath').value.trim(),
                };
            }

            if (type === 'postgresql') {
                return {
                    name: document.getElementById('name').value.trim(),
                    type: 'postgresql',
                    scope: scope,
                    host: document.getElementById('host').value.trim(),
                    port: parseInt(document.getElementById('port').value, 10),
                    database: document.getElementById('database').value.trim(),
                    username: document.getElementById('username').value.trim(),
                    password: document.getElementById('password').value,
                    ssl: document.getElementById('ssl').checked,
                };
            }

            return {
                name: document.getElementById('name').value.trim(),
                type: 'mysql',
                scope: scope,
                host: document.getElementById('host').value.trim(),
                port: parseInt(document.getElementById('port').value, 10),
                database: document.getElementById('database').value.trim(),
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value,
            };
        }

        function showMessage(text, type) {
            messageDiv.textContent = text;
            messageDiv.className = 'message ' + type;
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'submit', data: getFormData() });
        });

        testBtn.addEventListener('click', () => {
            showMessage('Testing connection...', 'info');
            vscode.postMessage({ command: 'test', data: getFormData() });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });

        browseBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFile' });
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'testResult':
                    showMessage(message.message, message.success ? 'success' : 'error');
                    break;
                case 'error':
                    showMessage(message.message, 'error');
                    break;
                case 'setFilePath':
                    document.getElementById('filePath').value = message.filePath;
                    break;
            }
        });

        // Initialize field visibility
        updateFieldVisibility();
    </script>
</body>
</html>`;
    }
}
