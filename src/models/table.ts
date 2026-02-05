import { ConnectionId } from './connection';

export type TableType = 'TABLE' | 'VIEW';

export interface TableInfo {
    name: string;
    type: TableType;
    connectionId: ConnectionId;
}
