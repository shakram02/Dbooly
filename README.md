# dbooly

A lightweight database viewer and SQL query tool for VS Code. Connect to MySQL and SQLite databases, browse schemas, execute queries, and get intelligent SQL completions.

## Features

### Connection Management
- **MySQL** and **SQLite** support
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

### Script Manager
- Save and organize SQL scripts in the sidebar
- Create folders to group related scripts

### Query Results
- View results in an interactive data grid
- Cancel long-running queries with `Escape`

## Install

Available on both marketplaces:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=shakram02.dbooly)
- [Open VSX Registry](https://open-vsx.org/extension/shakram02/dbooly) (Cursor, Windsurf, etc.)

## Requirements

- VS Code 1.70.0+, Cursor, or any VS Code-compatible editor

### Supported Databases
- MySQL 5.7+ / MariaDB 10.2+
- SQLite 3

## Usage

1. Open the **dbooly** sidebar (database icon in the activity bar)
2. Click **Add Connection** and select your database type
3. For MySQL, enter your host, port, and credentials
4. For SQLite, browse to your `.db` / `.sqlite` file
5. Open any `.sql` file and press `Ctrl+Enter` to execute

## Extension Settings

This extension works out of the box with no configuration required.

## Keyboard Shortcuts

| Command | Keybinding |
|---------|------------|
| Execute SQL | `Ctrl+Enter` / `Cmd+Enter` |
| Cancel Query | `Escape` |
| Format SQL | `Shift+Alt+F` (default formatter) |

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
