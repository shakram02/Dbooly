export type ConnectionId = string;

export type DatabaseType = 'mysql' | 'sqlite' | 'postgresql';

export type ConnectionScope = 'project' | 'global';

// Base interface with common fields
interface BaseConnectionConfig {
    id: ConnectionId;
    name: string;
    scope: ConnectionScope;
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

// PostgreSQL-specific connection config
export interface PostgreSQLConnectionConfig extends BaseConnectionConfig {
    type: 'postgresql';
    host: string;
    port: number;
    database: string;
    username: string;
    ssl: boolean;
}

// Discriminated union of all connection types
export type ConnectionConfig = MySQLConnectionConfig | SQLiteConnectionConfig | PostgreSQLConnectionConfig;

// With password variants
export interface MySQLConnectionConfigWithPassword extends MySQLConnectionConfig {
    password: string;
}

// SQLite doesn't need password
export type SQLiteConnectionConfigWithPassword = SQLiteConnectionConfig;

// PostgreSQL with password
export interface PostgreSQLConnectionConfigWithPassword extends PostgreSQLConnectionConfig {
    password: string;
}

export type ConnectionConfigWithPassword =
    MySQLConnectionConfigWithPassword | SQLiteConnectionConfigWithPassword | PostgreSQLConnectionConfigWithPassword;

// Type guards for cleaner conditional logic
export function isMySQLConnection(config: ConnectionConfig): config is MySQLConnectionConfig {
    return config.type === 'mysql';
}

export function isSQLiteConnection(config: ConnectionConfig): config is SQLiteConnectionConfig {
    return config.type === 'sqlite';
}

export function isPostgreSQLConnection(config: ConnectionConfig): config is PostgreSQLConnectionConfig {
    return config.type === 'postgresql';
}
