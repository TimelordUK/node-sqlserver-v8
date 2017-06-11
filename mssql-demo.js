"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = require('msnodesqlv8');
let fs = require('fs');
let supp = require('./demo-support');
let conn_str;
let demos = [
    connection,
    prepared,
    table,
    procedure,
    query,
    event
];
let support = null;
let procedureHelper = null;
let helper = null;
let parsedJSON = null;
supp.GlobalConn.init(exports.sql, (co) => {
    conn_str = co.conn_str;
    support = co.support;
    procedureHelper = new support.ProcedureHelper(conn_str);
    procedureHelper.setVerbose(false);
    let async = co.async;
    helper = co.helper;
    parsedJSON = helper.getJSON();
    console.log(conn_str);
    async.series(demos, () => {
        console.log("demo has finished.");
    });
});
function event(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let conn = null;
    let fns = [
        function (async_done) {
            console.log("event begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("listen to the events raised from the driver");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            let q = conn.query(s, (err, res) => {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            });
            q.on('meta', (meta) => {
                console.log('meta[0].name = ' + meta[0].name);
            });
            q.on('column', (col) => {
                console.log('column = ' + col);
            });
            q.on('rowcount', (count) => {
                console.log('rowcount = ' + count);
            });
            q.on('row', (row) => {
                console.log('row = ' + row);
            });
            q.on('done', () => {
                console.log('done');
            });
            q.on('error', (err) => {
                console.log(err);
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... event ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function query(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let conn = null;
    let fns = [
        function (async_done) {
            console.log("query begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log('execute an ad hoc query with temporary connection.');
            let q = "declare @s NVARCHAR(MAX) = ?; select @s as s";
            exports.sql.query(conn_str, q, ['node is great'], (err, res) => {
                Assert.ifError(err);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("use an open connection to call query()");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.query(s, (err, res) => {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log("use an open connection to call queryRaw()");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.queryRaw(s, (err, res) => {
                Assert.ifError(err);
                console.log("res.length = " + res.rows.length);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log('use timeout to place limit on how long to wait for query.');
            let queryObj = {
                query_str: "waitfor delay \'00:00:10\';",
                query_timeout: 2
            };
            conn.query(queryObj, (err) => {
                Assert.check(err != null);
                Assert.check(err.message.indexOf('Query timeout expired') > 0);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... query ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function procedure(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let conn = null;
    let sp_name = "test_sp_get_int_int";
    let def = "alter PROCEDURE <name>" +
        "(\n" +
        "@num1 INT,\n" +
        "@num2 INT,\n" +
        "@num3 INT OUTPUT\n" +
        "\n)" +
        "AS\n" +
        "BEGIN\n" +
        "   SET @num3 = @num1 + @num2\n" +
        "   RETURN 99;\n" +
        "END\n";
    let fns = [
        function (async_done) {
            console.log("procedure begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            def = def.replace(/<name>/g, sp_name);
            console.log("create a procedure " + sp_name);
            console.log(def);
            procedureHelper.createProcedure(sp_name, def, () => {
                async_done();
            });
        },
        function (async_done) {
            let pm = conn.procedureMgr();
            pm.callproc(sp_name, [10, 5], (err, results, output) => {
                Assert.ifError(err);
                let expected = [99, 15];
                console.log(output);
                Assert.check(expected[0] == output[0], "results didn't match");
                Assert.check(expected[1] == output[1], "results didn't match");
                async_done();
            });
        },
        function (async_done) {
            let pm = conn.procedureMgr();
            console.log("describe procedure.");
            pm.describe(sp_name, summary => {
                let s = JSON.stringify(summary, null, 2);
                console.log(s);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... procedure ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function connection(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let conn = null;
    let fns = [
        function (async_done) {
            console.log("connection begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("fetch spid for the connection.");
            conn.query("select @@SPID as id, CURRENT_USER as name", (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1, "unexpected result length.");
                let sp = res[0]['id'];
                Assert.check(sp != null, "did not find expected id.");
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... connection ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function empSelectSQL() {
    return `SELECT [BusinessEntityID]
     ,[NationalIDNumber]
     ,[LoginID]
     ,[OrganizationNode]
     ,[OrganizationLevel]
     ,[JobTitle]
     ,[BirthDate]
     ,[MaritalStatus]
     ,[Gender]
     ,[HireDate]
     ,[SalariedFlag]
     ,[VacationHours]
     ,[SickLeaveHours]
     ,[CurrentFlag]
     ,[rowguid]
     ,[ModifiedDate]
     FROM [scratch].[dbo].[Employee]
     WHERE BusinessEntityID = ?`;
}
function empDeleteSQL() {
    return `DELETE FROM [scratch].[dbo].[Employee]
        WHERE BusinessEntityID = ?`;
}
function prepared(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let statements = {
        selectStatement: null,
        deleteStatement: null,
    };
    let table_name = "Employee";
    let conn = null;
    function employeePrepare(query, done) {
        conn.prepare(query, (err, ps) => {
            Assert.ifError(err);
            done(ps);
        });
    }
    let fns = [
        function (async_done) {
            console.log("prepared begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },
        function (async_done) {
            let tm = conn.tableMgr();
            tm.bind(table_name, (bulkMgr) => {
                bulkMgr.insertRows(parsedJSON, () => {
                    async_done();
                });
            });
        },
        function (async_done) {
            console.log("preparing a select statement.");
            employeePrepare(empSelectSQL(), (ps) => {
                statements.selectStatement = ps;
                async_done();
            });
        },
        function (async_done) {
            console.log("preparing a free statement.");
            employeePrepare(empDeleteSQL(), (ps) => {
                statements.deleteStatement = ps;
                async_done();
            });
        },
        function (async_done) {
            console.log("check statements.");
            Assert.check(statements != null, "prepared statement object is null.");
            Assert.check(statements.selectStatement != null, "prepared select is null");
            Assert.check(statements.deleteStatement != null, "prepared free is null");
            async_done();
        },
        function (async_done) {
            let id = 1;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            });
        },
        function (async_done) {
            let id = 2;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            });
        },
        function (async_done) {
            let id = 5;
            console.log("use prepared statement to free " + id);
            statements.deleteStatement.preparedQuery([id], err => {
                Assert.ifError(err);
                async_done();
            });
        },
        function (async_done) {
            console.log("check how many rows are left.");
            conn.query("select * from Employee", (err, res) => {
                Assert.ifError(err);
                console.log("returned rows " + res.length);
                Assert.check(res.length == 9, "one row should have been deleted.");
                async_done();
            });
        },
        function (async_done) {
            console.log("free statements");
            statements.selectStatement.free(() => {
                statements.deleteStatement.free(() => {
                    async_done();
                });
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... prepared ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function table(done) {
    let async = new support.Async();
    let Assert = new support.Assert();
    let helper = new support.EmployeeHelper(exports.sql, conn_str);
    let conn = null;
    let table_name = "Employee";
    let bm = null;
    let records = helper.getJSON();
    let fns = [
        function (async_done) {
            console.log("table begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("create an employee table.");
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },
        function (async_done) {
            let tm = conn.tableMgr();
            console.log("bind to table " + table_name);
            tm.bind(table_name, (bulk) => {
                bm = bulk;
                Assert.check(bm != null, "no bulk manager returned.");
                async_done();
            });
        },
        function (async_done) {
            console.log("bulk insert records.");
            bm.insertRows(records, () => {
                async_done();
            });
        },
        function (async_done) {
            console.log("check rows have been inserted.");
            conn.query("select * from " + table_name, (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == records.length);
                async_done();
            });
        },
        function (async_done) {
            console.log("update a column.");
            let newDate = new Date("2015-01-01T00:00:00.000Z");
            let modifications = [];
            records.forEach((emp) => {
                emp.ModifiedDate = newDate;
                modifications.push({
                    BusinessEntityID: emp.BusinessEntityID,
                    ModifiedDate: newDate
                });
            });
            let updateCols = [
                {
                    name: 'ModifiedDate'
                }
            ];
            bm.setUpdateCols(updateCols);
            bm.updateRows(modifications, () => {
                async_done();
            });
        },
        function (async_done) {
            let summary = bm.getSummary();
            let s = JSON.stringify(summary, null, 2);
            console.log(s);
            console.log(summary.select_signature);
            console.log("prepare the above statement.");
            let select = summary.select_signature;
            conn.prepare(select, (err, ps) => {
                Assert.ifError(err);
                ps.preparedQuery([1], (err, res) => {
                    Assert.ifError(err);
                    Assert.check(res.length == 1);
                    async_done();
                });
            });
        },
        function (async_done) {
            console.log("free the records using bulk operation.");
            let keys = helper.extractKey(records, 'BusinessEntityID');
            bm.deleteRows(keys, () => {
                async_done();
            });
        },
        function (async_done) {
            console.log("check rows have been deleted.");
            conn.query("select * from " + table_name, (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 0);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... table ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
//# sourceMappingURL=mssql-demo.js.map