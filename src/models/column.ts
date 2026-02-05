import { ConnectionId } from './connection';

export type KeyType = 'PRIMARY' | 'FOREIGN' | null;

export interface ForeignKeyRef {
    table: string;
    column: string;
}

export interface ColumnInfo {
    name: string;
    dataType: string;
    nullable: boolean;
    keyType: KeyType;
    defaultValue: string | null;
    foreignKeyRef: ForeignKeyRef | null;
    tableName: string;
    connectionId: ConnectionId;
}
