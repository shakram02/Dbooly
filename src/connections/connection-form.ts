import * as vscode from 'vscode';
import { ConnectionConfigWithPassword } from '../models/connection';

type FormData = Omit<ConnectionConfigWithPassword, 'id'>;

interface FormMessage {
    command: 'submit' | 'test' | 'cancel';
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
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static show(
        extensionUri: vscode.Uri,
        defaults: Partial<FormData> | undefined,
        title: string,
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

        ConnectionFormPanel.currentPanel = new ConnectionFormPanel(panel, defaults, title, onSubmit, onTest);
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
            <label for="type">Database Type</label>
            <select id="type" name="type" disabled>
                <option value="mysql" selected>MySQL</option>
            </select>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="host" class="required">Host</label>
                <input type="text" id="host" name="host" value="${d.host || 'localhost'}" required placeholder="localhost">
            </div>
            <div class="form-group small">
                <label for="port" class="required">Port</label>
                <input type="number" id="port" name="port" value="${d.port || 3306}" required min="1" max="65535">
            </div>
        </div>

        <div class="form-group">
            <label for="database" class="required">Database Name</label>
            <input type="text" id="database" name="database" value="${d.database || ''}" required placeholder="mydb">
        </div>

        <div class="row">
            <div class="form-group">
                <label for="username" class="required">Username</label>
                <input type="text" id="username" name="username" value="${d.username || ''}" required placeholder="root">
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" value="${d.password || ''}" placeholder="••••••••">
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

        function getFormData() {
            return {
                name: document.getElementById('name').value.trim(),
                type: document.getElementById('type').value,
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

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'testResult':
                    showMessage(message.message, message.success ? 'success' : 'error');
                    break;
                case 'error':
                    showMessage(message.message, 'error');
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
