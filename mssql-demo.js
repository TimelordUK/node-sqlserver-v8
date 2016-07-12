
// require the module so it can be used in your node JS code.

var sql = require('node-sqlserver-v8');
var fs = require('fs');

/*
 This demo assumes a SQL server database is available.  Modify the connection string below
 appropriately.  Note, for testing sqllocaldb can be very useful - here a sql server
 database can be run from the command line.

 for example :-

 sqllocaldb create node
 sqllocaldb start node
 sqllocaldb info node
*/

var conn_str = "Driver={SQL Server Native Client 11.0};Server= np:\\\\.\\pipe\\LOCALDB#2515B136\\tsql\\query;Database={scratch};Trusted_Connection=Yes;";

var support = new DemoSupport(conn_str);
var async = new support.Async();

var demos = [
    // open connection, simple query and close.
    connection,
    // prepared statements to repeat execute SQL with different params.
    preparedStatements,
    // use the table manager to bind to a table and interact with it.
    table
];

async.series(demos, function() {
    console.log("demo has finished.")
});

function connection(done) {

    var async = new support.Async();
    var assert = new support.Assert();
    var conn = null;

    var fns = [

        function(async_done) {
            console.log("connection begins ...... ");
            async_done();
        },

        function(async_done) {
            console.log("opening a connection ....");
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                conn = new_conn;
                assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function(async_done) {
            console.log("fetch spid for the connection.");
            conn.query("select @@SPID as id, CURRENT_USER as name", function (err, res) {
                assert.ifError(err);
                assert.check(res.length == 1, "unexpected result length.");
                var sp = res[0]['id'];
                assert.check(sp != null, "did not find expected id.");
                async_done();
            });
        },

        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },

        function(async_done) {
            console.log("...... connection ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, function() {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    })
}

function preparedStatements(done) {

// create and populate table - fetch prepared statements to select and delete records for employee table.
// use the prepared statements to select and delete rows.
// free the statements and indicate this part of the demo has finished.

    var async = new support.Async();
    var assert = new support.Assert();
    var statements = null;
    var conn = null;
    var fns = [

        function(async_done) {
            console.log("preparedStatements begins ...... ");
            async_done();
        },

        function (async_done) {
            console.log("opening a connection ....");
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                conn = new_conn;
                assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function(async_done) {
            console.log("preparing a select and delete statement.");
                support.prepareEmployee(conn, function (prepared) {
                assert.check(prepared != null, "prepared statement object is null.");
                assert.check(prepared.select != null, "prepared select is null");
                assert.check(prepared.delete != null, "prepared delete is null");
                statements = prepared;
                async_done();
            });
        },

        function(async_done) {
            var id = 1;
            console.log("use prepared statement to fetch " + id);
            statements.select.preparedQuery([id], function(err, res) {
                assert.ifError(err);
                assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            })
        },

        function(async_done) {
            var id = 2;
            console.log("use prepared statement to fetch " + id);
            statements.select.preparedQuery([id], function(err, res) {
                assert.ifError(err);
                assert.check(res.length == 1);
                console.log(res[0]);
                async_done();
            })
        },

        function(async_done) {
            var id = 5;
            console.log("use prepared statement to delete " + id);
            statements.delete.preparedQuery([id], function(err) {
                assert.ifError(err);
                async_done();
            })
        },

        function(async_done) {
            console.log("check how many rows are left.");
            conn.query("select * from Employee", function(err, res) {
                assert.ifError(err);
                console.log("returned rows " + res.length);
                assert.check(res.length == 9, "one row should have been deleted.");
                async_done();
            });
        },

        function (async_done) {
            console.log("free statements");
            statements.select.free(function () {
                statements.delete.free(function () {
                    async_done();
                })
            })
        },

        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },

        function(async_done) {
            console.log("...... preparedStatements ends.");
            async_done();
        }
    ];

    console.log("executing async set of functions .....");
    async.series(fns, function() {
        console.log("..... async completes. \n\n\n\n\n\n");
        done();
    });
}

function table(done) {

    var async = new support.Async();
    var assert = new support.Assert();
    var helper =  new support.EmployeeHelper(sql, conn_str);
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
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                conn = new_conn;
                assert.check(conn != null, "connection from open is null.");
                console.log("... open");
                async_done();
            });
        },

        function (async_done) {
            console.log("create an employee table.");
            helper.dropCreateTable({
                name : table_name
            }, function () {
                async_done();
            });
        },

        function (async_done) {
            var tm = conn.tableMgr();
            console.log("bind to table " + table_name);
            tm.bind(table_name, function(bulk) {
                bm = bulk;
                assert.check(bm != null, "no bulk manager returned.");
                async_done();
            })
        },

        function (async_done) {
            console.log("bulk insert records.");
            bm.insertRows(records, function() {
                async_done();
            });
        },

        function (async_done) {
            console.log("check rows have been inserted.");
            conn.query("select * from " + table_name, function(err, res) {
                assert.ifError(err);
                assert.check(res.length == records.length);
                async_done();
            });
        },

        function (async_done) {
            console.log("update a column.");
            var newDate = new Date("2015-01-01T00:00:00.000Z");
            var modifications = [];
            records.forEach(function(emp) {
                emp.ModifiedDate = newDate;
                modifications.push( {
                    BusinessEntityID : emp.BusinessEntityID,
                    ModifiedDate : newDate
                });
            });

            var updateCols = [
                {
                    name: 'ModifiedDate'
                }
            ];

            bm.setUpdateCols(updateCols);
            bm.updateRows(modifications, function() {
                async_done();
            });
        },

        function(async_done) {
            var keys = helper.extractKey(records, 'BusinessEntityID');
            bm.deleteRows(keys, function() {
               async_done();
            });
        },

        function (async_done) {
            console.log("check rows have been deleted.");
            conn.query("select * from " + table_name, function(err, res) {
                assert.ifError(err);
                assert.check(res.length == 0);
                async_done();
            });
        },

        function (async_done) {
            console.log("close connection.");
            conn.close(function () {
                async_done();
            });
        },

        function(async_done) {
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

function DemoSupport(conn_str) {

    function Assert() {
        function ifError(err) {
            if (err) {
                console.log("error whilst executing msnodelsqlv8 demo - error is " + err);
                process.exit();
            }
        }

        function check(test, err) {
            if (!test) {
                console.log("check condition fails in msnodelsqlv8 demo - error is " + err);
                process.exit();
            }
        }

        this.ifError = ifError;
        this.check = check;
    }

    function Async() {
        function series(suite, done) {
            var i = 0;
            next();
            function next() {
                var fn = suite[i];
                fn(function () {
                    iterate();
                })
            }

            function iterate() {
                ++i;
                if (i == suite.length) {
                    done();
                } else next();
            }
        }

        this.series = series;
    }

    function EmployeeHelper(native, cstr) {

        var conn_str = cstr;
        var sql = native;

        function extractKey(parsedJSON, key) {
            var keys = [];
            parsedJSON.forEach(function (emp) {
                var obj = {
                };
                obj[key] = emp[key];
                keys.push(obj);
            });
            return keys;
        }

        function dropCreateTable(params, doneFunction) {

            var async = new Async();
            var name = params.name;
            var type = params.type;
            var assert = new Assert();
            var conn;

            function readFile(f, done) {
                console.log("reading " + f);
                fs.readFile(f, 'utf8', function (err, data) {
                    if (err) {
                        done(err);
                    } else
                        done(data);
                });
            }

            var sequence = [

                function (async_done) {
                    sql.open(conn_str, function (err, new_con) {
                        assert.ifError(err);
                        conn = new_con;
                        async_done();
                    });
                },

                function (async_done) {
                    var dropSql = "DROP TABLE " + name;
                    console.log(dropSql);
                    conn.query(dropSql, function () {
                        async_done();
                    });
                },

                function (async_done) {
                    var folder = __dirname + '/test';
                    var file = folder + '/sql/' + name;
                    file += '.sql';

                    function inChunks(arr, callback) {
                        var i = 0;
                        console.log(arr[i]);
                        conn.query(arr[i], next);
                        function next(err, res) {
                            assert.ifError(err);
                            assert.check(res.length === 0);
                            ++i;
                            if (i < arr.length) {
                                console.log(arr[i]);
                                conn.query(arr[i], next);
                            }
                            else callback();
                        }
                    }

                    // submit the SQL one chunk at a time to create table with constraints.
                    readFile(file, function (createSql) {
                        createSql = createSql.replace(/<name>/g, name);
                        createSql = createSql.replace(/<type>/g, type);
                        var arr = createSql.split("GO");
                        for (var i = 0; i < arr.length; ++i) {
                            arr[i] = arr[i].replace(/^\s+|\s+$/g, '');
                        }
                        inChunks(arr, function () {
                            async_done();
                        });
                    });
                },

                function(async_done) {
                    conn.close(function() {
                        async_done();
                    });
                }
            ];

            async.series(sequence,
                function () {
                    doneFunction();
                });
        }

        function getJSON() {
            var folder = __dirname + '/test';
            var fs = require('fs');
            //noinspection JSUnresolvedFunction
            var parsedJSON = JSON.parse(fs.readFileSync(folder + '/employee.json', 'utf8'));

            for (var i = 0; i < parsedJSON.length; ++i) {
                parsedJSON[i].OrganizationNode = new Buffer(parsedJSON[i].OrganizationNode.data, 'utf8');
                parsedJSON[i].BirthDate = new Date(parsedJSON[i].BirthDate);
                parsedJSON[i].HireDate = new Date(parsedJSON[i].HireDate);
                parsedJSON[i].ModifiedDate = new Date(parsedJSON[i].ModifiedDate);
            }
            return parsedJSON;
        }

        this.getJSON = getJSON;
        this.dropCreateTable = dropCreateTable;
        this.extractKey = extractKey;

        return this;
    }

    function prepareEmployee(conn, done) {

        var assert = new Assert();
        var helper = new EmployeeHelper(sql, conn_str);
        var parsedJSON = helper.getJSON();

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

        var table_name = "Employee";
        var prepared = {
            select : null,
            delete : null
        };

        var actions = [

            // open a connection.

            // drop / create an Employee table.
            function (async_done) {
                console.log("call utility function dropCreateTable ....");
                helper.dropCreateTable({
                    name : table_name
                }, function () {
                    console.log(".... dropCreateTable done.");
                    async_done();
                });
            },

            // insert test set using bulk insert
            function (async_done) {
                var tm = conn.tableMgr();
                tm.bind(table_name, function (bulkMgr) {
                    console.log("insertRows " + parsedJSON.length);
                    bulkMgr.insertRows(parsedJSON, function () {
                        async_done();
                    });
                });
            },

            // prepare a select statement.
            function (async_done) {
                employeePrepare(empSelectSQL(), function (ps) {
                    prepared.select = ps;
                    async_done();
                })
            },

            // prepare a delete statement.
            function (async_done) {
                employeePrepare(empDeleteSQL(), function (ps) {
                    prepared.delete = ps;
                    async_done();
                })
            }
        ];

        function employeePrepare(query, done) {
            console.log("prepare statement " + query);
            conn.prepare(query, function (err, ps) {
                assert.ifError(err);
                done(ps);
            });
        }

        var async = new Async();
        async.series(actions,
            function () {
                done(prepared);
            });
    }
    this.prepareEmployee = prepareEmployee;
    this.Async = Async;
    this.Assert = Assert;
    this.EmployeeHelper = EmployeeHelper;
}

