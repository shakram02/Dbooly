# dbooly

A lightweight database viewer and SQL query tool for VS Code. Connect to MySQL databases, browse schemas, execute queries, and get intelligent SQL completions.

## Features

### Connection Management
- Add, edit, and delete database connections
- Securely store credentials using VS Code's secret storage
- Quick-switch between multiple connections
- Star frequently used tables for easy access

### SQL Editing
- **Execute queries** with `Ctrl+Enter` / `Cmd+Enter`
- **CodeLens** shows "Run" buttons above each SQL statement
- **Auto-completion** for tables, columns, and keywords
- **SQL formatting** with dialect-aware formatting
- **Syntax validation** with real-time diagnostics

### Schema Browser
- Browse databases, tables, and columns in the sidebar
- View table data with a single click
- Search tables across your database

### Query Results
- View results in an interactive data grid
- Cancel long-running queries with `Escape`

## Install

Available on both marketplaces:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=shakram02.dbooly)
- [Open VSX Registry](https://open-vsx.org/extension/shakram02/dbooly) (Cursor, Windsurf, etc.)

## Requirements

- VS Code 1.70.0+, Cursor, or any VS Code-compatible editor
- MySQL 5.7+ or MariaDB 10.2+

## Usage

1. Open the **dbooly** sidebar (database icon in the activity bar)
2. Click **Add Connection** and enter your database credentials
3. Open any `.sql` file
4. Press `Ctrl+Enter` to execute the statement at your cursor

## Extension Settings

This extension works out of the box with no configuration required.

## Keyboard Shortcuts

| Command | Keybinding |
|---------|------------|
| Execute SQL | `Ctrl+Enter` / `Cmd+Enter` |
| Cancel Query | `Escape` |
| Format SQL | `Shift+Alt+F` (default formatter) |

## Known Issues

- Currently supports MySQL/MariaDB only. PostgreSQL and SQLite support planned.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
