// require the module so it can be used in your node JS code.

import {MsNodeSqlDriverApiModule as v8} from './lib/MsNodeSqlDriverApiModule'

import v8Connection = v8.v8Connection;
import v8PreparedStatement = v8.v8PreparedStatement;
import v8BindCb = v8.v8BindCb;
import v8BulkMgr = v8.v8BulkTableMgr;
import v8Error = v8.v8Error;

export const sql: v8.v8driver = require('msnodesqlv8');

let fs = require('fs');
let supp = require('./demo-support');

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

let conn_str: string;

let demos = [
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

interface Employee {
    BusinessEntityID: number
    NationalIDNumber: string
    LoginID: string
    OrganizationNode: any
    OrganizationLevel: number,
    JobTitle: string,
    BirthDate: Date,
    MaritalStatus: string,
    Gender: string,
    HireDate: string,
    SalariedFlag: boolean,
    VacationHours: number,
    SickLeaveHours: number,
    CurrentFlag: boolean,
    rowguid: string,
    ModifiedDate: Date
}

let support: any = null;
let procedureHelper: any = null;
let helper: any = null;
let parsedJSON: Array<Employee> = null;

supp.GlobalConn.init(sql, (co: any) => {
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
    }
// to override an auto discovered sqllocaldb str assign above and uncomment below.
// , test_conn_str
);

function event(done: Function): void {

    let async = new support.Async();
    let Assert = new support.Assert();
    let conn: v8Connection = null;

    let fns: Array<Function> = [

        function (async_done: Function) {
            console.log("event begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err: v8Error, new_conn: v8Connection) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("listen to the events raised from the driver");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            let q = conn.query(s, (err: v8Error, res: Array<any>) => {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            });

            q.on('meta', (meta: any) => {
                console.log('meta[0].name = ' + meta[0].name);
            });

            q.on('column', (col: any) => {
                console.log('column = ' + col);
            });

            q.on('rowcount', (count: any) => {
                console.log('rowcount = ' + count);
            });

            q.on('row', (row: any) => {
                console.log('row = ' + row);
            });

            q.on('done', () => {
                console.log('done');
            });

            q.on('error', (err: string) => {
                console.log(err);
            });
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done()
            });
        },

        function (async_done: Function) {
            console.log("...... event ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    })
}

function query(done: Function) {

    let async = new support.Async();
    let Assert = new support.Assert();

    let conn: v8Connection = null;

    let fns = [

        function (async_done: Function) {
            console.log("query begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log('execute an ad hoc query with temporary connection.');
            let q = "declare @s NVARCHAR(MAX) = ?; select @s as s";
            sql.query(conn_str, q, ['node is great'], (err, res) => {
                Assert.ifError(err);
                console.log(res);
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("use an open connection to call query()");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.query(s, (err, res) => {
                Assert.ifError(err);
                console.log("res.length = " + res.length);
                console.log(res);
                async_done();
            })
        },

        function (async_done: Function) {
            console.log("use an open connection to call queryRaw()");
            let s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
            console.log(s);
            conn.queryRaw(s, (err, res) => {
                Assert.ifError(err);
                console.log("res.length = " + res.rows.length);
                console.log(res);
                async_done();
            })
        },

        function (async_done: Function) {
            console.log('use timeout to place limit on how long to wait for query.');
            let queryObj = {
                query_str: "waitfor delay \'00:00:10\';",
                query_timeout: 2
            };

            conn.query(queryObj, (err: any) => {
                Assert.check(err != null);
                Assert.check(err.message.indexOf('Query timeout expired') > 0);
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("...... query ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    })
}

function procedure(done: Function) {

    let async = new support.Async();
    let Assert = new support.Assert();

    let conn: v8Connection = null;

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

    let fns: ((async_done: Function) => any)[] = [

        function (async_done: Function) {
            console.log("procedure begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done: Function) {
            def = def.replace(/<name>/g, sp_name);
            console.log("create a procedure " + sp_name);
            console.log(def);
            procedureHelper.createProcedure(sp_name, def, () => {
                async_done();
            })
        },

        function (async_done: Function) {
            let pm = conn.procedureMgr();
            pm.callproc(sp_name, [10, 5], (err: v8Error, results: any, output: Array<any>) => {
                Assert.ifError(err);
                let expected = [99, 15];
                console.log(output);
                Assert.check(expected[0] == output[0], "results didn't match");
                Assert.check(expected[1] == output[1], "results didn't match");
                async_done();
            });
        },

        function (async_done: Function) {
            let pm = conn.procedureMgr();
            console.log("describe procedure.");
            pm.describe(sp_name, summary => {
                let s = JSON.stringify(summary, null, 2);
                console.log(s);
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("...... procedure ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    })
}

function connection(done: Function) {

    let async = new support.Async();
    let Assert = new support.Assert();

    let conn: v8Connection = null;

    let fns = [

        function (async_done: Function) {
            console.log("connection begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("fetch spid for the connection.");
            conn.query("select @@SPID as id, CURRENT_USER as name", (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1, "unexpected result length.");
                let sp = res[0]['id'];
                Assert.check(sp != null, "did not find expected id.");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("...... connection ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, () => {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    })
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

function prepared(done: Function) {

// create and populate table - fetch prepared statements to select and free records for employee table.
// use the prepared statements to select and free rows.
// free the statements and indicate this part of the demo has finished.

    let async = new support.Async();
    let Assert = new support.Assert();


    let statements: {selectStatement: v8PreparedStatement; deleteStatement: v8PreparedStatement} = {
        selectStatement: null,
        deleteStatement: null,
    };

    let table_name = "Employee";

    let conn: v8Connection = null;

    function employeePrepare(query: string, done: Function) {
        conn.prepare(query, (err, ps) => {
            Assert.ifError(err);
            done(ps);
        });
    }

    let fns = [

        function (async_done: Function) {
            console.log("prepared begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        // drop / create an Employee table.
        function (async_done: Function) {
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },

        // insert test set using bulk insert
        function (async_done: Function) {
            let tm = conn.tableMgr();
            tm.bind(table_name, (bulkMgr: v8BulkMgr) => {
                bulkMgr.insertRows(parsedJSON, () => {
                    async_done();
                });
            });
        },

        // prepare a select statement.
        function (async_done: Function) {
            console.log("preparing a select statement.");
            employeePrepare(empSelectSQL(), (ps: v8PreparedStatement) => {
                statements.selectStatement = ps;
                async_done();
            })
        },

        // prepare a free statement.
        function (async_done: Function) {
            console.log("preparing a free statement.");
            employeePrepare(empDeleteSQL(), (ps: v8PreparedStatement) => {
                statements.deleteStatement = ps;
                async_done();
            })
        },

        function (async_done: Function) {
            console.log("check statements.");
            Assert.check(statements != null, "prepared statement object is null.");
            Assert.check(statements.selectStatement != null, "prepared select is null");
            Assert.check(statements.deleteStatement != null, "prepared free is null");
            async_done();
        },

        function (async_done: Function) {
            let id = 1;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            })
        },

        function (async_done: Function) {
            let id = 2;
            console.log("use prepared statement to fetch " + id);
            statements.selectStatement.preparedQuery([id], (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            })
        },

        function (async_done: Function) {
            let id = 5;
            console.log("use prepared statement to free " + id);
            statements.deleteStatement.preparedQuery([id], err => {
                Assert.ifError(err);
                async_done();
            })
        },

        function (async_done: Function) {
            console.log("check how many rows are left.");
            conn.query("select * from Employee", (err, res) => {
                Assert.ifError(err);
                console.log("returned rows " + res.length);
                Assert.check(res.length == 9, "one row should have been deleted.");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("free statements");
            statements.selectStatement.free(() => {
                statements.deleteStatement.free(() => {
                    async_done();
                })
            })
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },

        function (async_done: Function) {
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

function table(done: Function) {

    let async = new support.Async();
    let Assert = new support.Assert();
    let helper = new support.EmployeeHelper(sql, conn_str);
    let conn: v8Connection = null;
    let table_name = "Employee";
    let bm: v8BulkMgr = null;
    let records : Array<Employee>= helper.getJSON();


    let fns = [

        function (async_done: Function) {
            console.log("table begins ...... ");
            async_done();
        },

        function (async_done: Function) {
            console.log("opening a connection ....");
            sql.open(conn_str, (err, new_conn) => {
                Assert.ifError(err);
                conn = new_conn;
                Assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("create an employee table.");
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },

        function (async_done: Function) {
            let tm = conn.tableMgr();
            console.log("bind to table " + table_name);
            tm.bind(table_name, (bulk: v8BulkMgr) => {
                bm = bulk;
                Assert.check(bm != null, "no bulk manager returned.");
                async_done();
            })
        },

        function (async_done: Function) {
            console.log("bulk insert records.");
            bm.insertRows(records, () => {
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("check rows have been inserted.");
            conn.query("select * from " + table_name, (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == records.length);
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("update a column.");
            let newDate = new Date("2015-01-01T00:00:00.000Z");
            let modifications: Array<any> = [];
            records.forEach((emp: Employee) => {
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

        // use the select signature to construct a prepared query.

        function (async_done: Function) {
            let summary = bm.getSummary();
            let s = JSON.stringify(summary, null, 2);
            console.log(s);
            console.log(summary.select_signature);
            console.log("prepare the above statement.");
            let select: string = summary.select_signature;
            conn.prepare(select, (err: v8Error, ps: v8PreparedStatement) => {
                Assert.ifError(err);
                ps.preparedQuery([1], (err, res) => {
                    Assert.ifError(err);
                    Assert.check(res.length == 1);
                    async_done();
                });
            });
        },

        function (async_done: Function) {
            console.log("free the records using bulk operation.");
            let keys = helper.extractKey(records, 'BusinessEntityID');
            bm.deleteRows(keys, () => {
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("check rows have been deleted.");
            conn.query("select * from " + table_name, (err, res) => {
                Assert.ifError(err);
                Assert.check(res.length == 0);
                async_done();
            });
        },

        function (async_done: Function) {
            console.log("close connection.");
            conn.close(() => {
                async_done();
            });
        },

        function (async_done: Function) {
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
