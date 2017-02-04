"use strict";
let sql = require('msnodesqlv8');
var MsNodeSqlWrapperModule;
(function (MsNodeSqlWrapperModule) {
    class QueryOptions {
        subscribing() {
            return this.onMeta != null
                || this.onColumn != null
                || this.onRowCount != null
                || this.onRow != null
                || this.onDone != null
                || this.onError != null
                || this.onClosed != null;
        }
    }
    MsNodeSqlWrapperModule.QueryOptions = QueryOptions;
    class QueryEvent {
    }
    QueryEvent.meta = 'meta';
    QueryEvent.column = 'column';
    QueryEvent.rowCount = 'rowCount';
    QueryEvent.row = 'row';
    QueryEvent.done = 'done';
    QueryEvent.error = 'error';
    QueryEvent.closed = 'closed';
    MsNodeSqlWrapperModule.QueryEvent = QueryEvent;
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
        subscribe(query, options) {
            if (options.onMeta != null) {
                query.on(QueryEvent.meta, (m) => options.onMeta(m));
            }
            if (options.onColumn != null) {
                query.on(QueryEvent.column, (c, d, m) => options.onColumn(c, d, m));
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
        runQuery(sql, method, options) {
            return new Promise((resolve, reject) => {
                if (options == null)
                    options = Connection.defaultOptions;
                if (this.legacy_conn == null)
                    reject('no native connection.');
                if (options.wrapperTimeoutMs > 0) {
                    setTimeout(options.wrapperTimeoutMs, () => {
                        reject(`wrapper timeout ${options.wrapperTimeoutMs} expired.`);
                    });
                }
                let all = [];
                let batch = 0;
                let next = (rows, more) => {
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
                let q = method({
                    query_str: sql,
                    query_timeout: timeout
                }, [], (err, rows, more) => {
                    if (err)
                        reject(err);
                    else
                        next(rows, more);
                });
                if (options.subscribing())
                    this.subscribe(q, options);
            });
        }
        query(sql, options) {
            return this.runQuery(sql, this.legacy_conn.query, options);
        }
        queryRaw(sql, options) {
            return this.runQuery(sql, this.legacy_conn.queryRaw, options);
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
    Connection.defaultOptions = new QueryOptions();
    MsNodeSqlWrapperModule.Connection = Connection;
    class Sql {
        constructor() {
            this.connections = new Dictionary();
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
                        let id = connection.id();
                        this.connections.add(id, connection);
                        resolve(connection);
                    }
                });
            });
        }
    }
    MsNodeSqlWrapperModule.Sql = Sql;
})(MsNodeSqlWrapperModule = exports.MsNodeSqlWrapperModule || (exports.MsNodeSqlWrapperModule = {}));
//# sourceMappingURL=MsNodeSqWrapperModule.js.map