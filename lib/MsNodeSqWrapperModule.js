"use strict";
let sql = require('msnodesqlv8');
var MsNodeSqlDriverV8;
(function (MsNodeSqlDriverV8) {
    class RowSet {
        constructor(object_vec, more) {
            this.object_vec = object_vec;
            this.more = more;
        }
    }
    MsNodeSqlDriverV8.RowSet = RowSet;
    class ObservableQuery {
        constructor(sql) {
            this.sql = sql;
        }
    }
    MsNodeSqlDriverV8.ObservableQuery = ObservableQuery;
    class Connection {
        constructor(legacy_conn) {
            this.legacy_conn = legacy_conn;
        }
        query(sql, timeout = 0) {
            return new Promise((resolve, reject) => {
                this.legacy_conn.query({
                    query_str: sql,
                    query_timeout: timeout
                }, [], (err, rows, more) => {
                    if (err)
                        reject(err);
                    else
                        resolve(new RowSet(rows, more));
                });
            });
        }
        queryRaw(sql, timeout = 0) {
            return new Promise((resolve, reject) => {
                this.legacy_conn.queryRaw({
                    query_str: sql,
                    query_timeout: timeout
                }, (err, raw, more) => {
                    if (err)
                        reject(err);
                    else
                        resolve(new RowSet(raw.rows, more));
                });
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
    MsNodeSqlDriverV8.Connection = Connection;
    class Sql {
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
    MsNodeSqlDriverV8.Sql = Sql;
})(MsNodeSqlDriverV8 = exports.MsNodeSqlDriverV8 || (exports.MsNodeSqlDriverV8 = {}));
//# sourceMappingURL=MsNodeSqWrapperModule.js.map