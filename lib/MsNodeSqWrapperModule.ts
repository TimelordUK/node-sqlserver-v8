/**
 * Created by Stephen on 1/22/2017.
 */
import {MsNodeSqlDriverModule} from './MsNodeSqlDriverModule'
let sql = require('msnodesqlv8');

export module MsNodeSqlWrapperModule {
    import v8Connection = MsNodeSqlDriverModule.v8Connection;
    import RawData = MsNodeSqlDriverModule.RawData;
    import v8Query = MsNodeSqlDriverModule.v8Query;

    export interface queryCb { (cb: any): void
    }

    class QueryOptions {
        public driverTimeoutMs: number;
        public wrapperTimeoutMs: number;

        public onMeta: queryCb;
        public onColumn: queryCb;
        public onRowCount: queryCb;
        public onRow: queryCb;
        public onDone: queryCb;
        public onError: queryCb;
        public onClosed: queryCb;

        public raw: boolean;

        public subscribing(): boolean {
            return this.onMeta != null
                || this.onColumn != null
                || this.onRowCount != null
                || this.onRow != null
                || this.onDone != null
                || this.onError != null
                || this.onClosed != null
        }
    }

    export class QueryEvent {
        public static meta = 'meta';
        public static column = 'column';
        public static rowCount = 'rowCount';
        public static row = 'row';
        public static done = 'done';
        public static error = 'error';
        public static closed = 'closed';
    }

    class Dictionary<T> {
        container : { [id: string] : T; } = {};

        count() : number
        {
            let keys = Object.keys(this.container);
            return keys.length;
        }
    }

    export class Connection {

        constructor(public legacy_conn: v8Connection) {
        }

        static defaultOptions: QueryOptions = new QueryOptions();

        private subscribe(query: v8Query, options: QueryOptions): void {

            if (options.onMeta != null) {
                query.on(QueryEvent.meta, (m) => options.onMeta(m));
            }
            if (options.onColumn != null) {
                query.on(QueryEvent.column, (m) => options.onColumn(m));
            }
            if (options.onRowCount != null) {
                query.on(QueryEvent.rowCount, (m) => options.onColumn(m));
            }
            if (options.onRow != null) {
                query.on(QueryEvent.row, (m) => options.onColumn(m));
            }
            if (options.onDone != null) {
                query.on(QueryEvent.done, (m) => options.onColumn(m));
            }
            if (options.onError != null) {
                query.on(QueryEvent.error, (m) => options.onError(m));
            }
            if (options.onClosed != null) {
                query.on(QueryEvent.closed, (m) => options.onClosed(m));
            }
        }

        public query(sql: string, options?: QueryOptions): Promise<any[]> {
            return new Promise((resolve, reject) => {
                if (options == null) options = Connection.defaultOptions;
                if (this.legacy_conn == null) reject('no native connection.');
                if (options.wrapperTimeoutMs > 0) {
                    setTimeout(options.wrapperTimeoutMs, () => {
                        reject(`wrapper timeout ${options.wrapperTimeoutMs} expired.`);
                    });
                }
                let all: any[] = [];
                let batch = 0;
                let next = (rows: any[], more: boolean) => {
                    batch++;
                    if (!more) {
                        let res = batch == 1 ? rows : all;
                        resolve(res);
                    }
                    else {
                        rows.forEach(r => all.push(r));
                    }
                };
                let timeout = options.driverTimeoutMs > 0 ? options.driverTimeoutMs / 1000 : 0;
                let method: Function = options.raw ? this.legacy_conn.queryRaw : this.legacy_conn.query;
                let q: v8Query = method({
                    query_str: sql,
                    query_timeout: timeout
                }, [], (err: string, rows: any[], more: boolean) => {
                    if (err) reject(err);
                    else next(rows, more);
                });

                if (options.subscribing()) this.subscribe(q, options);
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

        constructor() {
        }

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