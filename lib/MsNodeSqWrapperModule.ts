/**
 * Created by Stephen on 1/22/2017.
 */
import {MsNodeSqlDriverModule} from './MsNodeSqlDriverModule'
let sql = require('msnodesqlv8');


export module MsNodeSqlDriverV8 {
    import v8Connection = MsNodeSqlDriverModule.v8Connection;
    import RawData = MsNodeSqlDriverModule.RawData;

    export class RowSet {
        constructor(public object_vec: Array<any>, public more: boolean) {
        }
    }

    export class ObservableQuery {
        constructor(public sql: string) {
        }
    }

    export class Connection {
        constructor(public legacy_conn: v8Connection) {
        }

        public query(sql: string, timeout: number = 0): Promise<RowSet> {
            return new Promise((resolve, reject) => {
                this.legacy_conn.query({
                    query_str: sql,
                    query_timeout: timeout
                }, [], (err: string, rows: Array<any>, more: boolean) => {
                    if (err) reject(err);
                    else resolve(new RowSet(rows, more));
                });
            });
        }

        public queryRaw(sql: string, timeout: number = 0): Promise<RowSet> {
            return new Promise((resolve, reject) => {
                this.legacy_conn.queryRaw({
                    query_str: sql,
                    query_timeout: timeout
                }, (err: string, raw: RawData, more: boolean) => {
                    if (err) reject(err);
                    else resolve(new RowSet(raw.rows, more));
                });
            });
        }

        public close(): Promise<any> {
            return new Promise((resolve, reject) => {
                this.legacy_conn.close((err: string) => {
                    if (err) reject(err);
                    else resolve();
                })
            });
        }
    }

    export class Sql {
        public open(connStr: string, timeout: number = 0): Promise<Connection> {
            return new Promise((resolve, reject) => {
                sql.open({
                    conn_str: connStr,
                    conn_timeout: timeout
                }, (err: string, c: any) => {
                    if (err) {
                        reject(err);
                    } else resolve(new Connection(c));
                });
            });
        }
    }
}