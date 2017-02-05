"use strict";
const MsNodeSqlDriverApiModule_1 = require('./MsNodeSqlDriverApiModule');
let sql = require('msnodesqlv8');
var MsNodeSqlWrapperModule;
(function (MsNodeSqlWrapperModule) {
    var v8QueryEvent = MsNodeSqlDriverApiModule_1.MsNodeSqlDriverApiModule.v8QueryEvent;
    class SqlCommand {
        constructor(connection) {
            this.connection = connection;
            this._rawFormat = false;
        }
        sql(s) {
            this._sql = s;
            this._procedure = null;
            return this;
        }
        params(v) {
            this._inputParams = v;
            return this;
        }
        procedure(s) {
            this._procedure = s;
            this._sql = null;
            return this;
        }
        rawFormat() {
            this._rawFormat = true;
            return this;
        }
        wrapperTimeoutMs(to) {
            this._wrapperTimeoutMs = to;
            return this;
        }
        driverTimeoutMs(to) {
            this._driverTimeoutMs = to;
            return this;
        }
        onMeta(cb) {
            this._onMeta = cb;
            return this;
        }
        onColumn(cb) {
            this._onColumn = cb;
            return this;
        }
        onRowCount(cb) {
            this._onRowCount = cb;
            return this;
        }
        onRow(cb) {
            this._onRow = cb;
            return this;
        }
        onDone(cb) {
            this._onDone = cb;
            return this;
        }
        onError(cb) {
            this._onError = cb;
            return this;
        }
        onClosed(cb) {
            this._onClosed = cb;
            return this;
        }
        subscribe() {
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
        subscribing() {
            return this._onMeta != null
                || this._onColumn != null
                || this._onRowCount != null
                || this._onRow != null
                || this._onDone != null
                || this._onError != null
                || this._onClosed != null;
        }
        execProcedure(resolve, reject, res) {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            let pm = this.connection.legacy_conn.procedureMgr();
            pm.setTimeout(timeout);
            this._query = pm.callproc(this._procedure, this._inputParams, (err, rows, more, outputParams) => {
                res.error = err;
                if (err)
                    reject(res);
                res.aggregate(rows);
                res.outputParams = outputParams;
                if (!more)
                    resolve(res);
            });
        }
        execQuery(resolve, reject, res) {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.query({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err, rows, more) => {
                res.error = err;
                if (err)
                    reject(res);
                res.aggregate(rows);
                if (!more)
                    resolve(res);
            });
        }
        execQueryRaw(resolve, reject, res) {
            let timeout = this._driverTimeoutMs > 0 ? this._driverTimeoutMs / 1000 : 0;
            this._query = this.connection.legacy_conn.queryRaw({
                query_str: this._sql,
                query_timeout: timeout
            }, this._inputParams, (err, rawData, more) => {
                res.error = err;
                if (err)
                    reject(res);
                res.aggregateRaw(rawData);
                if (!more)
                    resolve(res);
            });
        }
        Execute() {
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
                    }
                    else {
                        this.execQueryRaw(resolve, reject, res);
                    }
                }
                else {
                    res.error = `both sql and procedure are null`;
                    reject(res);
                }
                if (this.subscribing()) {
                    this.subscribe();
                }
            });
        }
    }
    MsNodeSqlWrapperModule.SqlCommand = SqlCommand;
    class RawData {
    }
    MsNodeSqlWrapperModule.RawData = RawData;
    class CommandResponse {
        aggregateRaw(raw) {
            let rd = this.rawData;
            if (rd == null) {
                this.rawData = rd = new RawData();
                rd.meta = raw.meta;
                rd.rows = [];
            }
            raw.rows.forEach(row => rd.rows.push(row));
        }
        aggregate(rows) {
            if (this.asObjects == null) {
                this.asObjects = [];
            }
            rows.forEach(r => this.asObjects.push(r));
        }
    }
    MsNodeSqlWrapperModule.CommandResponse = CommandResponse;
    class Dictionary {
        constructor() {
            this.container = {};
        }
        count() {
            let keys = Object.keys(this.container);
            return keys.length;
        }
        values() {
            let va = [];
            let keys = Object.keys(this.container);
            keys.forEach(k => va.push(this.container[k]));
            return va;
        }
        keys() {
            return Object.keys(this.container);
        }
        containsKey(key) {
            return this.container[key] != null;
        }
        add(key, v) {
            if (this.containsKey(key))
                throw new Error(`duplicate key ${key}`);
            this.container[key] = v;
        }
        remove(key) {
            delete this.container[key];
        }
        get(key) {
            return this.container[key];
        }
        forEach(cb) {
            Object.keys(this.container).forEach((k) => cb(k, this.container[k]));
        }
    }
    MsNodeSqlWrapperModule.Dictionary = Dictionary;
    class Connection {
        constructor(legacy_conn) {
            this.legacy_conn = legacy_conn;
        }
        id() {
            return this.legacy_conn.id.toString();
        }
        Command() {
            return new SqlCommand(this);
        }
        close() {
            return new Promise((resolve, reject) => {
                this.legacy_conn.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
    }
    MsNodeSqlWrapperModule.Connection = Connection;
    class ConnectionPool {
        constructor() {
            this.connections = new Dictionary();
        }
    }
    MsNodeSqlWrapperModule.ConnectionPool = ConnectionPool;
    class Sql {
        constructor() {
        }
        open(connStr, timeout = 0) {
            return new Promise((resolve, reject) => {
                sql.open({
                    conn_str: connStr,
                    conn_timeout: timeout
                }, (err, legacy) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        let connection = new Connection(legacy);
                        resolve(connection);
                    }
                });
            });
        }
    }
    MsNodeSqlWrapperModule.Sql = Sql;
})(MsNodeSqlWrapperModule = exports.MsNodeSqlWrapperModule || (exports.MsNodeSqlWrapperModule = {}));
//# sourceMappingURL=MsNodeSqWrapperModule.js.map