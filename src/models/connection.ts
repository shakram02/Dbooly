export type ConnectionId = string;

export type DatabaseType = 'mysql' | 'sqlite';

// Base interface with common fields
interface BaseConnectionConfig {
    id: ConnectionId;
    name: string;
}

// MySQL-specific connection config
export interface MySQLConnectionConfig extends BaseConnectionConfig {
    type: 'mysql';
    host: string;
    port: number;
    database: string;
    username: string;
}

// SQLite-specific connection config
export interface SQLiteConnectionConfig extends BaseConnectionConfig {
    type: 'sqlite';
    filePath: string;
}

// Discriminated union of all connection types
export type ConnectionConfig = MySQLConnectionConfig | SQLiteConnectionConfig;

// With password variants
export interface MySQLConnectionConfigWithPassword extends MySQLConnectionConfig {
    password: string;
}

// SQLite doesn't need password
export type SQLiteConnectionConfigWithPassword = SQLiteConnectionConfig;

export type ConnectionConfigWithPassword =
    MySQLConnectionConfigWithPassword | SQLiteConnectionConfigWithPassword;

// Type guards for cleaner conditional logic
export function isMySQLConnection(config: ConnectionConfig): config is MySQLConnectionConfig {
    return config.type === 'mysql';
}

export function isSQLiteConnection(config: ConnectionConfig): config is SQLiteConnectionConfig {
    return config.type === 'sqlite';
}
