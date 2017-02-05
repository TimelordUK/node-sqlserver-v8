// require the module so it can be used in your node JS code.
"use strict";
exports.sql = require('msnodesqlv8');
var fs = require('fs');
var supp = require('./demo-support');
/*
 This demo assumes a SQL server database is available.  Modify the connection string below
 appropriately.  Note, for testing sqllocaldb can be very useful - here a sql server
 database can be run from the command line.

 for example :-

 sqllocaldb create node
 sqllocaldb start node
 sqllocaldb info node
 */
// let test_conn_str = "Driver={SQL Server Native Client 11.0};Server= np:\\\\.\\pipe\\LOCALDB#8765A478\\tsql\\query;Database={scratch};Trusted_Connection=Yes;";
// if you have a sqllocaldb running with instance called "node" and db "scratch" then
// this will be used automatically.  To use another connection string for test
// uncomment below.
var conn_str;
var demos = [
    // open connection, simple query and close.
    connection,
    // prepared statements to repeat execute SQL with different params.
    prepared,
    // use the table manager to bind to a table and interact with it.
    table,
    // create and execute a stored procedure using pm.
    procedure,
    // query both ad hoc and via an open connection.
    query,
    // shows driver based events can be captured.
    event
];
var support = null;
var procedureHelper = null;
var helper = null;
var parsedJSON = null;
supp.GlobalConn.init(exports.sql, function (co) {
    conn_str = co.conn_str;
    support = co.support;
    procedureHelper = new support.ProcedureHelper(conn_str);
    procedureHelper.setVerbose(false);
    var async = co.async;
    helper = co.helper;
    parsedJSON = helper.getJSON();
    console.log(conn_str);
    async.series(demos, function () {
        console.log("demo has finished.");
    });
});
function event(done) {
    var async = new support.Async();
    var Assert = new support.Assert();
    var conn = null;
    var fns = [
        function (async_done) {
            console.log("event begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("listen to the events raised from the driver");
            var s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            var q = conn.query(s, function (err, res) {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            });
            q.on('meta', function (meta) {
                console.log('meta[0].name = ' + meta[0].name);
            });
            q.on('column', function (col) {
                console.log('column = ' + col);
            });
            q.on('rowcount', function (count) {
                console.log('rowcount = ' + count);
            });
            q.on('row', function (row) {
                console.log('row = ' + row);
            });
            q.on('done', function () {
                console.log('done');
            });
            q.on('error', function (err) {
                console.log(err);
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... event ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function query(done) {
    var async = new support.Async();
    var Assert = new support.Assert();
    var conn = null;
    var fns = [
        function (async_done) {
            console.log("query begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log('execute an ad hoc query with temporary connection.');
            var q = "declare @s NVARCHAR(MAX) = ?; select @s as s";
            exports.sql.query(conn_str, q, ['node is great'], function (err, res) {
                Assert.ifError(err);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("use an open connection to call query()");
            var s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.query(s, function (err, res) {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log("use an open connection to call queryRaw()");
            var s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.queryRaw(s, function (err, res) {
                Assert.ifError(err);
                console.log("res.length = " + res.rows.length);
                console.log(res);
                async_done();
            });
        },
        function (async_done) {
            console.log('use timeout to place limit on how long to wait for query.');
            var queryObj = {
                query_str: "waitfor delay \'00:00:10\';",
                query_timeout: 2
            };
            conn.query(queryObj, function (err) {
                Assert.check(err != null);
                Assert.check(err.message.indexOf('Query timeout expired') > 0);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... query ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function procedure(done) {
    var async = new support.Async();
    var Assert = new support.Assert();
    var conn = null;
    var sp_name = "test_sp_get_int_int";
    var def = "alter PROCEDURE <name>" +
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
    var fns = [
        function (async_done) {
            console.log("procedure begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
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
            procedureHelper.createProcedure(sp_name, def, function () {
                async_done();
            });
        },
        function (async_done) {
            var pm = conn.procedureMgr();
            pm.callproc(sp_name, [10, 5], function (err, results, output) {
                Assert.ifError(err);
                var expected = [99, 15];
                console.log(output);
                Assert.check(expected[0] == output[0], "results didn't match");
                Assert.check(expected[1] == output[1], "results didn't match");
                async_done();
            });
        },
        function (async_done) {
            var pm = conn.procedureMgr();
            console.log("describe procedure.");
            pm.describe(sp_name, function (summary) {
                var s = JSON.stringify(summary, null, 2);
                console.log(s);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... procedure ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function connection(done) {
    var async = new support.Async();
    var Assert = new support.Assert();
    var conn = null;
    var fns = [
        function (async_done) {
            console.log("connection begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        function (async_done) {
            console.log("fetch spid for the connection.");
            conn.query("select @@SPID as id, CURRENT_USER as name", function (err, res) {
                Assert.ifError(err);
                Assert.check(res.length == 1, "unexpected result length.");
                var sp = res[0]['id'];
                Assert.check(sp != null, "did not find expected id.");
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... connection ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function empSelectSQL() {
    return "SELECT [BusinessEntityID]\n     ,[NationalIDNumber]\n     ,[LoginID]\n     ,[OrganizationNode]\n     ,[OrganizationLevel]\n     ,[JobTitle]\n     ,[BirthDate]\n     ,[MaritalStatus]\n     ,[Gender]\n     ,[HireDate]\n     ,[SalariedFlag]\n     ,[VacationHours]\n     ,[SickLeaveHours]\n     ,[CurrentFlag]\n     ,[rowguid]\n     ,[ModifiedDate]\n     FROM [scratch].[dbo].[Employee]\n     WHERE BusinessEntityID = ?";
}
function empDeleteSQL() {
    return "DELETE FROM [scratch].[dbo].[Employee]\n        WHERE BusinessEntityID = ?";
}
function prepared(done) {
    // create and populate table - fetch prepared statements to select and free records for employee table.
    // use the prepared statements to select and free rows.
    // free the statements and indicate this part of the demo has finished.
    var async = new support.Async();
    var Assert = new support.Assert();
    var statements = {
        selectStatement: null,
        deleteStatement: null,
    };
    var table_name = "Employee";
    var conn = null;
    function employeePrepare(query, done) {
        conn.prepare(query, function (err, ps) {
            Assert.ifError(err);
            done(ps);
        });
    }
    var fns = [
        function (async_done) {
            console.log("prepared begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },
        // drop / create an Employee table.
        function (async_done) {
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },
        // insert test set using bulk insert
        function (async_done) {
            var tm = conn.tableMgr();
            tm.bind(table_name, function (bulkMgr) {
                bulkMgr.insertRows(parsedJSON, function () {
                    async_done();
                });
            });
        },
        // prepare a select statement.
        function (async_done) {
            console.log("preparing a select statement.");
            employeePrepare(empSelectSQL(), function (ps) {
                statements.selectStatement = ps;
                async_done();
            });
        },
        // prepare a free statement.
        function (async_done) {
            console.log("preparing a free statement.");
            employeePrepare(empDeleteSQL(), function (ps) {
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
            var id = 1;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], function (err, res) {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            });
        },
        function (async_done) {
            var id = 2;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], function (err, res) {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            });
        },
        function (async_done) {
            var id = 5;
            console.log("use prepared statement to free " + id);
            statements.deleteStatement.preparedQuery([id], function (err) {
                Assert.ifError(err);
                async_done();
            });
        },
        function (async_done) {
            console.log("check how many rows are left.");
            conn.query("select * from Employee", function (err, res) {
                Assert.ifError(err);
                console.log("returned rows " + res.length);
                Assert.check(res.length == 9, "one row should have been deleted.");
                async_done();
            });
        },
        function (async_done) {
            console.log("free statements");
            statements.selectStatement.free(function () {
                statements.deleteStatement.free(function () {
                    async_done();
                });
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... prepared ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
function table(done) {
    var async = new support.Async();
    var Assert = new support.Assert();
    var helper = new support.EmployeeHelper(exports.sql, conn_str);
    var conn = null;
    var table_name = "Employee";
    var bm = null;
    var records = helper.getJSON();
    var fns = [
        function (async_done) {
            console.log("table begins ...... ");
            async_done();
        },
        function (async_done) {
            console.log("opening a connection ....");
            exports.sql.open(conn_str, function (err, new_conn) {
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
            var tm = conn.tableMgr();
            console.log("bind to table " + table_name);
            tm.bind(table_name, function (bulk) {
                bm = bulk;
                Assert.check(bm != null, "no bulk manager returned.");
                async_done();
            });
        },
        function (async_done) {
            console.log("bulk insert records.");
            bm.insertRows(records, function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("check rows have been inserted.");
            conn.query("select * from " + table_name, function (err, res) {
                Assert.ifError(err);
                Assert.check(res.length == records.length);
                async_done();
            });
        },
        function (async_done) {
            console.log("update a column.");
            var newDate = new Date("2015-01-01T00:00:00.000Z");
            var modifications = [];
            records.forEach(function (emp) {
                emp.ModifiedDate = newDate;
                modifications.push({
                    BusinessEntityID: emp.BusinessEntityID,
                    ModifiedDate: newDate
                });
            });
            var updateCols = [
                {
                    name: 'ModifiedDate'
                }
            ];
            bm.setUpdateCols(updateCols);
            bm.updateRows(modifications, function () {
                async_done();
            });
        },
        // use the select signature to construct a prepared query.
        function (async_done) {
            var summary = bm.getSummary();
            var s = JSON.stringify(summary, null, 2);
            console.log(s);
            console.log(summary.select_signature);
            console.log("prepare the above statement.");
            var select = summary.select_signature;
            conn.prepare(select, function (err, ps) {
                Assert.ifError(err);
                ps.preparedQuery([1], function (err, res) {
                    Assert.ifError(err);
                    Assert.check(res.length == 1);
                    async_done();
                });
            });
        },
        function (async_done) {
            console.log("free the records using bulk operation.");
            var keys = helper.extractKey(records, 'BusinessEntityID');
            bm.deleteRows(keys, function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("check rows have been deleted.");
            conn.query("select * from " + table_name, function (err, res) {
                Assert.ifError(err);
                Assert.check(res.length == 0);
                async_done();
            });
        },
        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },
        function (async_done) {
            console.log("...... table ends.");
            async_done();
        }
    ];
    console.log("executing async set of functions .....");
    async.series(fns, function () {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}
