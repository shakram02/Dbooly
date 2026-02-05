export type ConnectionId = string;

export type DatabaseType = 'mysql';

export interface ConnectionConfig {
    id: ConnectionId;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    database: string;
    username: string;
}

export interface ConnectionConfigWithPassword extends ConnectionConfig {
    password: string;
}
