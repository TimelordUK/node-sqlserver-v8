var fs = require('fs');

function DemoSupport(native, conn_str) {

    var sql = native;

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

exports.DemoSupport = DemoSupport;