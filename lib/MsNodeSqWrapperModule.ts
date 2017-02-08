/**
 * Created by Stephen on 1/22/2017.
 */
import {MsNodeSqlDriverApiModule as v8api} from './MsNodeSqlDriverApiModule'

export module MsNodeSqlWrapperModule {

    import v8Connection = v8api.v8Connection;
    import v8Query = v8api.v8Query;
    import v8Meta = v8api.v8Meta;
    import v8EventColumnCb = v8api.v8EventColumnCb;
    import v8RawData = v8api.v8RawData;
    import v8QueryEvent = v8api.v8QueryEvent;
    import v8Error = v8api.v8Error;
    import v8PreparedStatement = v8api.v8PreparedStatement;

    export const legacyDriver: v8api.v8driver = require('msnodesqlv8');

    export class SqlModuleWrapperError implements v8Error {
        constructor(public message: string) {
        }

        sqlstate: string;
        code: number;
    }

    export interface queryCb<T> { (v: T): void
    }

    export enum SqlCommandType
    {
        None,
        QueryObjectFormat,
        QueryRawFormat,
        StoredProcedure,
        PreparingStatement,
        PreparedStatement
    }

    export class SqlCommand {

        constructor(public connection: Connection, public id ?: string, public commandType: SqlCommandType = SqlCommandType.QueryObjectFormat) {
        }

        _driverTimeoutMs: number;
        _wrapperTimeoutMs: number;
        _sql: string;
        _procedure: string;

        _inputParams: any[];

        _onMeta: queryCb<v8Meta>;
        _onColumn: v8EventColumnCb;
        _onRowCount: queryCb<number>;
        _onRow: queryCb<number>;
        _onDone: queryCb<any>;
        _onError: queryCb<string>;
        _onClosed: queryCb<string>;

        _query: v8Query;
        _preparedStatement: v8PreparedStatement;

        public isPrepared(): boolean {
            return this.commandType == SqlCommandType.PreparingStatement;
        }

        public sql(s: string): SqlCommand {
            this._sql = s;
            this._procedure = null;
            if (this.commandType == SqlCommandType.None)
                this.commandType = SqlCommandType.QueryObjectFormat;
            return this;
        }

        public params(v: any[]): SqlCommand {
            this._inputParams = v;
            return this;
        }

        public param(v: any): SqlCommand {
            if (this._inputParams == null) {
                this._inputParams = [];
            }
            this._inputParams.push(v);
            return this;
        }

        public procedure(s: string): SqlCommand {
            this._procedure = s;
            this.commandType = SqlCommandType.StoredProcedure;
            this._sql = null;
            this.unsubscribe();
            return this;
        }

        public rawFormat(): SqlCommand {
            this.commandType = SqlCommandType.QueryRawFormat;
            return this;
        }

        public wrapperTimeoutMs(to: number): SqlCommand {
            this._wrapperTimeoutMs = to;
            return this;
        }

        public driverTimeoutMs(to: number): SqlCommand {
            this._driverTimeoutMs = to;
            return this;
        }

        public onMeta(cb: queryCb<v8Meta>): SqlCommand {
            this._onMeta = cb;
            return this;
        }

        public onColumn(cb: v8EventColumnCb): SqlCommand {
            this._onColumn = cb;
            return this;
        }

        public onRowCount(cb: queryCb<number>): SqlCommand {
            this._onRowCount = cb;
            return this;
        }

        public onRow(cb: queryCb<number>): SqlCommand {
            this._onRow = cb;
            return this;
        }

        public onDone(cb: queryCb<any>): SqlCommand {
            this._onDone = cb;
            return this;
        }

        public onError(cb: queryCb<string>): SqlCommand {
            this._onError = cb;
            return this;
        }

        public onClosed(cb: queryCb<string>): SqlCommand {
            this._onClosed = cb;
            return this;
        }

        public unsubscribe(): void {
            this._onMeta = null;
            this._onColumn = null;
            this._onRowCount = null;
            this._onRow = null;
            this._onDone = null;
            this._onError = null;
            this._onClosed = null;
        }

        private subscribe(): void {

            let query = this._query;

            if (this._onMeta != null) {
                query.on(v8QueryEvent.meta, m => this._onMeta(m));
            }
            if (this._onColumn != null) {
                query.on(v8QueryEvent.column, (c, d, m) => this._onColumn(c, d, m));
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

        private execProcedure(resolve: Function, reject: Function, res: SqlCommandResponse): void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            let pm = this.connection.legacy_conn.procedureMgr();
            pm.setTimeout(timeout);
            pm.callproc(this._procedure, this._inputParams, (err?: v8Error, rows?: any[], outputParams?: any[]) => {
                if (err) {
                    res.error = err;
                    reject(res);
                }
                else {
                    res.aggregate(rows);
                    res.outputParams = outputParams;
                    resolve(res);
                }
            });
        }

        private execQuery(resolve: Function, reject: Function, res: SqlCommandResponse): void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.query({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err: v8Error, rows: any[], more: boolean) => {
                if (err) {
                    res.error = err;
                    reject(res);
                } else {
                    res.aggregate(rows);
                    if (!more) resolve(res);
                }
            });
        }

        private execQueryRaw(resolve: Function, reject: Function, res: SqlCommandResponse): void {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.queryRaw({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err?: v8Error, rawData?: v8RawData, more?: boolean) => {
                if (err) {
                    res.error = err;
                    reject(res);
                } else {
                    res.aggregateRaw(rawData);
                    if (!more) resolve(res);
                }
            });
        }

        private execPrepared(resolve: Function, reject: Function, res: SqlCommandResponse): void {
            this._preparedStatement.preparedQuery(
                this._inputParams, (err: v8Error, rows: any[], more: boolean) => {
                    if (err) {
                        res.error = err;
                        reject(res);
                    } else {
                        res.aggregate(rows);
                        if (!more) resolve(res);
                    }
                });
        }

        public freePrepared(): Promise<SqlCommand> {
            return new Promise((resolve, reject) => {
                let inst = this;
                if (this.commandType != SqlCommandType.PreparedStatement) {
                    reject(new SqlModuleWrapperError('freePrepared must be called on prepared command.'));
                    return;
                }
                this._preparedStatement.free(() => {
                    inst._preparedStatement = null;
                    inst.commandType = SqlCommandType.None;
                    resolve(inst);
                })
            });
        }

        public prepare(): Promise<SqlCommand> {
            return new Promise((resolve, reject) => {
                if (this._sql == null) {
                    reject(new SqlModuleWrapperError('prepare must be called after sql() with sql to prepare.'));
                    return;
                }
                if (this.commandType == SqlCommandType.PreparingStatement) {
                    reject(new SqlModuleWrapperError('prepare is preparing and must be called once only on a command.'));
                    return;
                }
                if (this._preparedStatement != null) {
                    reject(new SqlModuleWrapperError('this command has previously been prepared.'));
                    return;
                }
                this.commandType = SqlCommandType.PreparingStatement;
                this.unsubscribe();
                let inst = this;
                this.connection.legacy_conn.prepare(this._sql, (err?: v8Error, statement?: v8PreparedStatement) => {
                    if (err) {
                        reject(err);
                        inst.commandType = SqlCommandType.None;
                    } else {
                        inst._preparedStatement = statement;
                        inst.commandType = SqlCommandType.PreparedStatement;
                        resolve(inst);
                    }
                })
            });
        }

        private dispatchCommandType(resolve: Function, reject: Function, res: SqlCommandResponse): void {
            switch (this.commandType) {

                case SqlCommandType.QueryObjectFormat: {
                    this.execQuery(resolve, reject, res);
                    break;
                }

                case SqlCommandType.QueryRawFormat: {
                    this.execQueryRaw(resolve, reject, res);
                    break;
                }

                case SqlCommandType.StoredProcedure: {
                    this.execProcedure(resolve, reject, res);
                    break;
                }

                case SqlCommandType.PreparingStatement: {
                    res.error = new SqlModuleWrapperError(`statement not yet prepared.`);
                    break;
                }

                case SqlCommandType.PreparedStatement: {
                    this.execPrepared(resolve, reject, res);
                    break;
                }

                default: {
                    res.error = new SqlModuleWrapperError(`${this.commandType} is not valid value.`);
                    break;
                }
            }
        }

        public execute(): Promise<SqlCommandResponse> {

            return new Promise((resolve, reject) => {
                let res = new SqlCommandResponse();
                let to = this._wrapperTimeoutMs;
                if (to > 0) {
                    setTimeout(to, () => {
                        res.error = new SqlModuleWrapperError(`wrapper timeout ${to} expired.`);
                        reject(res);
                    });
                }

                this.dispatchCommandType(resolve, reject, res);

                if (res.error != null) {
                    reject(res);
                } else if (this.subscribing()) {
                    this.subscribe()
                }
            })
        }
    }

    export class RawData implements v8RawData {
        public meta: v8Meta[];
        public rows: Array<any[]>;
    }

    export class SqlCommandResponse {

        public aggregateRaw(raw: v8RawData) {
            let rd = this.rawData;
            if (rd == null) {
                this.rawData = rd = new RawData();
                rd.meta = raw.meta;
                rd.rows = [];
            }
            raw.rows.forEach(row => rd.rows.push(row));
        }

        public aggregate(rows: any[]) {
            if (this.asObjects == null) {
                this.asObjects = [];
            }
            rows.forEach(r => this.asObjects.push(r));
        }

        public error: v8Error;
        public asObjects: any[];
        public outputParams: any[];
        public rawData: v8RawData;
    }

    export interface dictIteratorCb<T> { (key: string, val: T): void
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

        public keys(): string[] {
            return Object.keys(this.container);
        }

        public containsKey(key: string): boolean {
            return this.container[key] != null;
        }

        public add(key: string, v: T): void {
            if (this.containsKey(key)) throw new Error(`duplicate key ${key}`);
            this.container[key] = v;
        }

        public remove(key: string): void {
            delete this.container[key];
        }

        public get(key: string): T {
            return this.container[key];
        }

        public forEach(cb: dictIteratorCb<T>) {
            Object.keys(this.container).forEach((k: string) => cb(k, this.container[k]));
        }
    }

    export class ConnectionPool {
        connections: Dictionary<Connection> = new Dictionary<Connection>();
    }

    export class CommandCache {
        public CachedCommands: Dictionary<SqlCommand> = new Dictionary<SqlCommand>();

        constructor(public connection: Connection) {
        }

        public get(id?: string): SqlCommand {
            if (id == null) return new SqlCommand(this.connection);
            let cached = this.CachedCommands.get(id);
            if (cached == null) {
                cached = new SqlCommand(this.connection);
                this.CachedCommands.add(id, cached);
            }
            return cached;
        }

        public free(commandId?: string): Promise<boolean> {
            return new Promise((resolve, reject) => {
                let c: SqlCommand = this.CachedCommands.get(commandId);
                if (c == null) {
                    reject(false);
                    return;
                }
                if (c.isPrepared()) {
                    c.freePrepared().then(() => {
                        this.CachedCommands.remove(commandId);
                        resolve(true);
                    });
                } else {
                    this.CachedCommands.remove(commandId);
                    resolve(commandId);
                }
            });
        }

        public deleteAll(): Promise<boolean> {
            return new Promise((resolve, reject) => {
                this.CachedCommands.forEach((id, c) => {
                    this.free(id).then(()=> {
                        if (this.CachedCommands.count() == 0) {
                            resolve(true);
                        }
                    }).catch(e => {
                        reject(e);
                    })
                });
            });
        }
    }

    export class Connection {

        public CommandCache: CommandCache;

        constructor(public legacy_conn: v8Connection) {
            this.CommandCache = new CommandCache(this);
        }

        public id(): string {
            return this.legacy_conn.id.toString();
        }

        public getCommand() : SqlCommand {
            return new SqlCommand(this);
        }

        public close(): Promise<any> {
            return new Promise((resolve, reject) => {
                this.legacy_conn.close((err: v8Error) => {
                    if (err) reject(err);
                    else resolve();
                })
            });
        }
    }

    export class Sql {

        constructor(public connStr: string) {
        }

        public execute(sql:string, params:any = [], raw:boolean = false) : Promise<SqlCommandResponse> {
            return new Promise((resolve, reject) => {
                this.open().then( (connection : Connection) => {
                    let command = new SqlCommand(connection);
                    if (raw) command = command.rawFormat();
                    command.sql(sql).params(params).execute().then(res=> {
                        connection.close().then(() => {
                            resolve(res);
                        }).catch(e=>{
                            reject(e);
                        });
                    }).catch(e=> {
                        reject(e);
                    })
                }).catch(e=> {
                    reject(e);
                });
            });
        }

        public open(timeout: number = 0): Promise<Connection> {
            return new Promise((resolve, reject) => {
                legacyDriver.open({
                    conn_str: this.connStr,
                    conn_timeout: timeout
                }, (err: v8Error, legacy: any) => {
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