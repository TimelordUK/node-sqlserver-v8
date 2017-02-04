/**
 * Created by Stephen on 1/22/2017.
 */
import {MsNodeSqlDriverModule} from './MsNodeSqlDriverModule'
let sql = require('msnodesqlv8');

export module MsNodeSqlWrapperModule {
    import v8Connection = MsNodeSqlDriverModule.v8Connection;
    import v8Query = MsNodeSqlDriverModule.v8Query;
    import v8Meta = MsNodeSqlDriverModule.v8Meta;
    import v8EventColumnCb = MsNodeSqlDriverModule.v8EventColumnCb;
    import v8RawData = MsNodeSqlDriverModule.v8RawData;

    export interface queryCb<T> { (v: T): void
    }

    export class QueryOptions {
        public driverTimeoutMs: number;
        public wrapperTimeoutMs: number;

        public onMeta: queryCb<v8Meta>;
        public onColumn: v8EventColumnCb;
        public onRowCount: queryCb<number>;
        public onRow: queryCb<number>;
        public onDone: queryCb<any>;
        public onError: queryCb<string>;
        public onClosed: queryCb<any>;

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

    export interface dictIteratorCb<T> { (key: string, val : T): void
    }

    export class Dictionary<T> {

        container: {[id: string]: T;} = {};

        public count(): number {
            let keys = Object.keys(this.container);
            return keys.length;
            }

        public values(): T[] {
            let va: T[] = [];
            let keys = Object.keys(this.container);
            keys.forEach(k => va.push(this.container[k]));
            return va;
        }

        public keys() : string[] {
            return Object.keys(this.container);
        }

        public containsKey(key: string): boolean {
            return this.container[key] != null;
        }

        public add(key: string, v: T): void {
            if (this.containsKey(key)) throw new Error(`duplicate key ${key}`);
            this.container[key] = v;
        }

        public remove(key:string) : void
        {
            delete this.container[key];
        }

        public get(key: string): T {
            return this.container[key];
        }

        public forEach(cb : dictIteratorCb<T>) {
            Object.keys(this.container).forEach((k:string) => cb(k, this.container[k]));
        }
    }

    export class Connection {

        constructor(public legacy_conn: v8Connection) {
        }
        public id() : string
        {
            return this.legacy_conn.id.toString();
        }

        static defaultOptions: QueryOptions = new QueryOptions();

        private subscribe(query: v8Query, options: QueryOptions): void {

            if (options.onMeta != null) {
                query.on(QueryEvent.meta, (m) => options.onMeta(m));
            }
            if (options.onColumn != null) {
                query.on(QueryEvent.column, (c,d,m) => options.onColumn(c,d,m));
            }
            if (options.onRowCount != null) {
                query.on(QueryEvent.rowCount, (m) => options.onRowCount(m));
            }
            if (options.onRow != null) {
                query.on(QueryEvent.row, (m) => options.onRow(m));
            }
            if (options.onDone != null) {
                query.on(QueryEvent.done, (m) => options.onDone(m));
            }
            if (options.onError != null) {
                query.on(QueryEvent.error, (m) => options.onError(m));
            }
            if (options.onClosed != null) {
                query.on(QueryEvent.closed, (m) => options.onClosed(m));
            }
        }

        private runQuery<T>(sql: string, method:Function, options?: QueryOptions): Promise<T> {
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

        public query(sql: string, options?: QueryOptions) : Promise<any[]> {
            return this.runQuery<any[]>(sql, this.legacy_conn.query, options);
        }

        public queryRaw(sql: string, options?: QueryOptions) : Promise<v8RawData> {
            return this.runQuery<any[]>(sql, this.legacy_conn.queryRaw, options);
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

        connections : Dictionary<Connection> = new Dictionary<Connection>();

        constructor() {
        }

        public open(connStr: string, timeout: number = 0): Promise<Connection> {
            return new Promise((resolve, reject) => {
                sql.open({
                    conn_str: connStr,
                    conn_timeout: timeout
                }, (err: string, legacy: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        let connection = new Connection(legacy);
                        let id :string = connection.id();
                        this.connections.add(id, connection);
                        resolve(connection);
                    }
                });
            });
        }
    }
}