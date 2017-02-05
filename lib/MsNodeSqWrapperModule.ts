/**
 * Created by Stephen on 1/22/2017.
 */
import {MsNodeSqlDriverApiModule as v8api} from './MsNodeSqlDriverApiModule'
let sql = require('msnodesqlv8');

export module MsNodeSqlWrapperModule {

    import v8Connection = v8api.v8Connection;
    import v8Query = v8api.v8Query;
    import v8Meta = v8api.v8Meta;
    import v8EventColumnCb = v8api.v8EventColumnCb;
    import v8RawData = v8api.v8RawData;
    import v8QueryEvent = v8api.v8QueryEvent;

    export interface queryCb<T> { (v: T): void
    }

    export class SqlCommand
    {
        constructor(public connection : Connection) {
            this._rawFormat = false;
        }

        _driverTimeoutMs: number;
        _wrapperTimeoutMs : number;
        _sql : string;
        _procedure : string;

        _inputParams:any[];
        _rawFormat : boolean;

        _onMeta: queryCb<v8Meta>;
        _onColumn: v8EventColumnCb;
        _onRowCount: queryCb<number>;
        _onRow: queryCb<number>;
        _onDone: queryCb<any>;
        _onError: queryCb<string>;
        _onClosed: queryCb<string>;

        _query: v8Query;

        public sql(s:string) : SqlCommand{
            this._sql = s;
            this._procedure = null;
            return this;
        }

        public params(v:any[]) : SqlCommand{
            this._inputParams = v;
            return this;
        }

        public procedure(s:string) : SqlCommand{
            this._procedure = s;
            this._sql = null;
            return this;
        }

        public rawFormat() : SqlCommand{
            this._rawFormat = true;
            return this;
        }

        public wrapperTimeoutMs(to:number) : SqlCommand{
            this._wrapperTimeoutMs = to;
            return this;
        }

        public driverTimeoutMs(to:number) : SqlCommand{
            this._driverTimeoutMs = to;
            return this;
        }

        public onMeta(cb : queryCb<v8Meta>) : SqlCommand
        {
            this._onMeta = cb;
            return this;
        }

        public onColumn(cb : v8EventColumnCb) : SqlCommand
        {
            this._onColumn = cb;
            return this;
        }

        public onRowCount(cb : queryCb<number>) : SqlCommand
        {
            this._onRowCount = cb;
            return this;
        }

        public onRow(cb : queryCb<number>) : SqlCommand
        {
            this._onRow = cb;
            return this;
        }

        public onDone(cb : queryCb<any>) : SqlCommand
        {
            this._onDone = cb;
            return this;
        }

        public onError(cb : queryCb<string>) : SqlCommand
        {
            this._onError = cb;
            return this;
        }

        public onClosed(cb : queryCb<string>) : SqlCommand
        {
            this._onClosed = cb;
            return this;
        }

        private subscribe(): void {

            let query = this._query;

            if (this._onMeta != null) {
                query.on(v8QueryEvent.meta, m => this._onMeta(m));
            }
            if (this._onColumn != null) {
                query.on(v8QueryEvent.column, (c, d, m) => this._onColumn(c,d,m));
            }
            if (this._onRowCount != null) {
                query.on(v8QueryEvent.rowCount, m => this._onRowCount(m));
            }
            if (this._onRow != null) {
                query.on(v8QueryEvent.row, m => this._onRow(m));
            }
            if (this._onDone != null) {
                query.on(v8QueryEvent.done, m => this._onDone(m));
            }
            if (this._onError != null) {
                query.on(v8QueryEvent.error, m => this._onError(m));
            }
            if (this._onClosed != null) {
                query.on(v8QueryEvent.closed, m => this._onClosed(m));
            }
        }

        public subscribing(): boolean {
            return this._onMeta != null
                || this._onColumn != null
                || this._onRowCount != null
                || this._onRow != null
                || this._onDone != null
                || this._onError != null
                || this._onClosed != null
        }

        private execProcedure(resolve:Function, reject:Function, res :CommandResponse) : void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            let pm = this.connection.legacy_conn.procedureMgr();
            pm.setTimeout(timeout);
            this._query = pm.callproc(this._procedure, this._inputParams, (err?: string, rows?: any[], more?: boolean, outputParams?:any[]) => {
                res.error = err;
                if (err) reject(res);
                res.aggregate(rows);
                res.outputParams = outputParams;
                if (!more) resolve(res);
            });
        }

        private execQuery(resolve:Function, reject:Function, res :CommandResponse) : void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.query({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err: string, rows: any[], more: boolean) => {
                res.error = err;
                if (err) reject(res);
                res.aggregate(rows);
                if (!more) resolve(res);
            });
        }

        private execQueryRaw(resolve:Function, reject:Function, res :CommandResponse) : void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.queryRaw({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err?: string, rawData?: v8RawData, more?: boolean) => {
                res.error = err;
                if (err) reject(res);
                res.aggregateRaw(rawData);
                if (!more) resolve(res);
            });
        }

        public Execute() : Promise<CommandResponse> {
            return new Promise((resolve, reject) => {
                let res = new CommandResponse();
                let to = this._wrapperTimeoutMs;
                if (to > 0) {
                    setTimeout(to, () => {
                        res.error = `wrapper timeout ${to} expired.`;
                        reject(res);
                    });
                }

                if (this._procedure != null) {
                    this.execProcedure(resolve, reject, res);
                }
                else if (this._sql != null) {
                    if (!this._rawFormat) {
                        this.execQuery(resolve, reject, res);
                    }else {
                        this.execQueryRaw(resolve, reject, res);
                    }
                }else {
                    res.error = `both sql and procedure are null`;
                    reject(res);
                }

                if (this.subscribing()) {
                   this.subscribe()
                }
            })
        }
    }

    export class RawData implements v8RawData{
        public meta: v8Meta[];
        public rows: Array<any[]>;
    }

    export class CommandResponse
    {
        public aggregateRaw(raw:v8RawData) {
            let rd = this.rawData;
            if (rd == null) {
                this.rawData = rd = new RawData();
                rd.meta = raw.meta;
                rd.rows = [];
            }
            raw.rows.forEach(row => rd.rows.push(row));
        }

        public aggregate(rows:any[]) {
            if (this.asObjects == null) {
                this.asObjects =[];
            }
            rows.forEach(r=>this.asObjects.push(r));
        }

        public error:string;
        public asObjects : any[];
        public outputParams : any[];
        public rawData : v8RawData;
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

        public Command() : SqlCommand {
            return new SqlCommand(this);
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

    export class ConnectionPool
    {
        connections : Dictionary<Connection> = new Dictionary<Connection>();
    }

    export class Sql {

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
                        resolve(connection);
                    }
                });
            });
        }
    }
}