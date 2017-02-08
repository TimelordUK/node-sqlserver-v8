var fs = require('fs');

var GlobalConn = (function() {

    var conn_str = "set global connection here";

    function getSqlLocalDbPipe(done) {
        var childProcess = require("child_process");
        var oldSpawn = childProcess.spawn;

        function mySpawn() {
            //console.log('spawn called');
            //console.log(arguments);
            return oldSpawn.apply(this, arguments);
        }

        childProcess.spawn = mySpawn;

        function extract(a) {
            a = a.trim();
            var idx = a.indexOf('np:');
            if (idx > 0) {
                a = a.substr(idx);
            }
            return a;
        }

        var child = childProcess.spawn('sqllocaldb', ['info', 'node']);
        child.stdout.on('data', function (data) {
            var str = data.toString();
            var arr = str.split('\r');
            arr.forEach(function (a) {
                var idx = a.indexOf('np:');
                if (idx > 0) {
                    var pipe = extract(a);
                    setImmediate(function () {
                        done(pipe)
                    });
                }
            });
            //Here is where the output goes
        });
        child.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
            //Here is where the error output goes
        });
        child.on('close', function (code) {
            //console.log('closing code: ' + code);
            //Here you can get the exit code of the script
        });
        child.on('error', function (code) {
            console.log('closing code: ' + code);
            process.exit();
            //Here you can get the exit code of the script
        });
    }

    var driver = "SQL Server Native Client 11.0";
    var database = "scratch";

    function getLocalConnStr(done) {
        getSqlLocalDbPipe(function (pipe) {
            var conn = "Driver={" + driver + "}; Server=" + pipe + "; Database={" + database + "}; Trusted_Connection=Yes;";
            done(conn);
        });
    }

    function init(sql, done, candidate_conn_str) {
        var ds = new DemoSupport();

        if (candidate_conn_str == null) {
            getLocalConnStr(function (cs) {
                var ret = {
                    driver: driver,
                    database: database,
                    conn_str: cs,
                    support: new DemoSupport(sql, cs),
                    async: new ds.Async(),
                    helper: new ds.EmployeeHelper(sql, cs),
                };
                done(ret);
            })
        }else {
            var ret = {
                driver : driver,
                database : database,
                conn_str : candidate_conn_str,
                support : new DemoSupport(sql, candidate_conn_str),
                async : new ds.Async(),
                helper : new ds.EmployeeHelper(sql, candidate_conn_str),
            };
            done(ret);
        }
    }

    function getConnStr() {
        return conn_str;
    }

    return {
        init : init,
        getConnStr : getConnStr
    };
})();

function DemoSupport(native) {

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

    function ProcedureHelper(conn) {

        var conn_str = conn;
        var async = new Async();
        var assert = new Assert();
        var verbose = true;

        function createProcedure(procedureName, procedureSql, doneFunction) {

            procedureSql = procedureSql.replace(/<name>/g, procedureName);

            var sequence = [
                function (async_done) {
                    var createSql = "IF NOT EXISTS (SELECT *  FROM sys.objects WHERE type = 'P' AND name = '" + procedureName + "')";
                    createSql += " EXEC ('CREATE PROCEDURE " + procedureName + " AS BEGIN SET nocount ON; END')";
                    if (verbose) console.log(createSql);
                    sql.query(conn_str, createSql, function () {
                        async_done();
                    });
                },

                function (async_done) {
                    sql.query(conn_str, procedureSql,
                        function (e) {
                            assert.ifError(e, "Error creating procedure.");
                            async_done();
                        });
                }
            ];

            async.series(sequence,
                function () {
                    doneFunction();
                });
        }

        function setVerbose(v) {
            verbose = v;
        }

        this.createProcedure = createProcedure;
        this.setVerbose = setVerbose;
    }

    function EmployeeHelper(native, cstr) {

        var conn_str = cstr;
        var sql = native;
        var verbose = true;

        function setVerbose(v) {
            verbose = v;
        }

        function extractKey(parsedJSON, key) {
            var keys = [];
            parsedJSON.forEach(function (emp) {
                var obj = {};
                obj[key] = emp[key];
                keys.push(obj);
            });
            return keys;
        }

        function dropCreateTable(params, doneFunction) {

            var async = new Async();
            var name = params.name;
            var type = params.type;
            var insert = false;
            if (params.hasOwnProperty("insert")) { //noinspection JSUnresolvedVariable
                insert = params.insert;
            }
            var assert = new Assert();
            var conn;

            function readFile(f, done) {
                if (verbose) console.log("reading " + f);
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
                    if (verbose) console.log(dropSql);
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
                        if (verbose) console.log(arr[i]);
                        conn.query(arr[i], next);
                        function next(err, res) {
                            assert.ifError(err);
                            assert.check(res.length === 0);
                            ++i;
                            if (i < arr.length) {
                                if (verbose) console.log(arr[i]);
                                conn.query(arr[i], function (err, res) {
                                    next(err, res);
                                });
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

                function (async_done) {
                    if (!insert) {
                        async_done();
                    }
                },

                function (async_done) {
                    conn.close(function () {
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
        this.setVerbose = setVerbose;

        return this;
    }

    this.Async = Async;
    this.Assert = Assert;
    this.EmployeeHelper = EmployeeHelper;
    this.ProcedureHelper = ProcedureHelper;
}

exports.DemoSupport = DemoSupport;
module.exports.GlobalConn = GlobalConn;
