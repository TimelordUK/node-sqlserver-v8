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
    }
    class Connection {
        constructor(legacy_conn) {
            this.legacy_conn = legacy_conn;
        }
        subscribe(query, options) {
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
        query(sql, options) {
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
                let method = options.raw ? this.legacy_conn.queryRaw : this.legacy_conn.query;
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
        }
        open(connStr, timeout = 0) {
            return new Promise((resolve, reject) => {
                sql.open({
                    conn_str: connStr,
                    conn_timeout: timeout
                }, (err, c) => {
                    if (err) {
                        reject(err);
                    }
                    else
                        resolve(new Connection(c));
                });
            });
        }
    }
    MsNodeSqlWrapperModule.Sql = Sql;
})(MsNodeSqlWrapperModule = exports.MsNodeSqlWrapperModule || (exports.MsNodeSqlWrapperModule = {}));
//# sourceMappingURL=MsNodeSqWrapperModule.js.map