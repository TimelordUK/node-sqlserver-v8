var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

function testBoilerPlate(params, doneFunction) {

    var name = params.name;
    var type = params.type;

    sql.open(conn_str, opened);

    function opened(err, conn) {
        assert.ifError(err);
        function readFile(f, done) {
            fs.readFile(f, 'utf8', function (err, data) {
                if (err) {
                    done(err);
                } else
                    done(data);
            });
        }

        var sequence = [
            function (async_done) {
                var dropSql = "DROP TABLE " + name;
                conn.query(dropSql, function () {
                    async_done();
                });
            },

            function (async_done) {
                var folder = __dirname;
                var file = folder + '/sql/' + name;
                file += '.sql';

                function inChunks(arr, callback) {
                    var i = 0;
                    conn.query(arr[i], next);
                    function next(err, res) {
                        assert.ifError(err);
                        assert(res.length === 0);
                        ++i;
                        if (i < arr.length)
                            conn.query(arr[i], next);
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
                var tm = conn.tableMgr();
                tm.bind(name, function (bulkMgr) {
                    assert(bulkMgr.columns.length > 0, "Error creating table");
                    async_done();
                });
            }];

        async.series(sequence,
            function () {
                doneFunction();
            });
    }
}

suite('bulk', function () {

    var c;
    this.timeout(45000);
    var tm;

    /*
     var totalObjectsForInsert = 1000;
     var test1BatchSize = 1;
     var test2BatchSize = 1000;
     */

    var totalObjectsForInsert = 500;
    var test1BatchSize = 1;
    var test2BatchSize = 500;

    setup(function (test_done) {

        sql.open(conn_str, function (err, new_conn) {

            assert.ifError(err);

            c = new_conn;

            test_done();
        });
    });

    teardown(function (done) {

        c.close(function (err) {
            assert.ifError(err);
            done();
        });
    });

    test('bulk insert simple multi-column object - default a nullable column ' + test2BatchSize, function (test_done) {

        function buildTest(count) {
            var arr = [];
            var str = '-';
            for (var i = 0; i < count; ++i) {
                str = str + i;
                if (i % 10 === 0) str = '-';
                var inst = {
                    pkid: i,
                    num1: i * 3,
                    num2: i * 4,
                    // do not present num3 - an array of nulls should be inserted.
                    st: str
                };
                arr.push(inst);
            }
            return arr;
        }

        var table_name = "BulkTest";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function test(bulkMgr) {
            var batch = totalObjectsForInsert;
            var vec = buildTest(batch);
            bulkMgr.setBatchSize(totalObjectsForInsert);
            bulkMgr.insertRows(vec, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                var s = "select count(*) as count from " + table_name;
                c.query(s, function (err, results) {
                    var expected = [{
                        count: batch
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    test_done();
                });
            }
        }
    });

    function getJSON() {
        var folder = __dirname;
        var fs = require('fs');
        var parsedJSON = JSON.parse(fs.readFileSync(folder + '/employee.json', 'utf8'));

        for (var i = 0; i < parsedJSON.length; ++i) {
            parsedJSON[i].OrganizationNode = new Buffer(parsedJSON[i].OrganizationNode.data, 'utf8');
            parsedJSON[i].BirthDate = new Date(parsedJSON[i].BirthDate);
            parsedJSON[i].HireDate = new Date(parsedJSON[i].HireDate);
            parsedJSON[i].ModifiedDate = new Date(parsedJSON[i].ModifiedDate);
        }
        return parsedJSON;
    }

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

     test('employee complex json object array bulk operations', function (test_done) {

        var table_name = "Employee";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function test(bulkMgr) {

            var parsedJSON = getJSON();
            var keys = extractKey(parsedJSON, 'BusinessEntityID');

            bulkMgr.insertRows(parsedJSON, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                bulkMgr.selectRows(keys, bulkDone);
            }

            function bulkDone(err, results) {
                assert.ifError(err);
                assert(results.length === parsedJSON.length);
                assert.deepEqual(results, parsedJSON, "results didn't match");
                test_done();
            }
        }
    });

    test('employee insert/select with non primary key', function (test_done) {

        var table_name = "Employee";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function test(bulkMgr) {

            var whereCols = [];
            whereCols.push({
                name : 'LoginID'
            });

            var parsedJSON = getJSON();
            var keys = extractKey(parsedJSON, 'LoginID');

            bulkMgr.insertRows(parsedJSON, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                bulkMgr.setWhereCols(whereCols);
                bulkMgr.selectRows(keys, bulkDone);
            }

            function bulkDone(err, results) {
                assert.ifError(err);
                assert(results.length === parsedJSON.length);
                assert.deepEqual(results, parsedJSON, "results didn't match");
                var summary = bulkMgr.getSummary();
                bulkMgr.setWhereCols(summary.primaryColumns);
                test_done();
            }
        }
    });

    test('employee insert - update a single column', function (test_done) {

        var table_name = "Employee";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function test(bulkMgr) {

            var parsedJSON = getJSON();
            var keys = extractKey(parsedJSON, 'BusinessEntityID');

            bulkMgr.insertRows(parsedJSON, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);

                var newDate = new Date("2015-01-01T00:00:00.000Z");
                var modifications = [];
                parsedJSON.forEach(function(emp) {
                    emp.ModifiedDate = newDate;
                    modifications.push( {
                        BusinessEntityID : emp.BusinessEntityID,
                        ModifiedDate : newDate
                    });
                });

                var updateCols = [];
                updateCols.push({
                    name : 'ModifiedDate'
                });

                bulkMgr.setUpdateCols(updateCols);
                bulkMgr.updateRows(modifications, updateDone);
            }

            function updateDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                bulkMgr.selectRows(keys, bulkDone);
                var summary = bulkMgr.getSummary();
                bulkMgr.setUpdateCols(summary.assignableColumns);
            }

            function bulkDone(err, results) {
                assert.ifError(err);
                assert(results.length === parsedJSON.length);
                assert.deepEqual(results, parsedJSON, "results didn't match");
                test_done();
            }
        }
    });

    function nullTest(batchSize, selectAfterInsert, test_done) {

        var params = {
            columnType: 'datetime',
            buildFunction: function () {
                return null;
            },
            updateFunction: null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select null column of datetime batchSize ' + test1BatchSize, function (test_done) {
        nullTest(test1BatchSize, false, test_done);
    });

    test('bulk insert/select null column of datetime batchSize ' + test2BatchSize, function (test_done) {
        nullTest(test2BatchSize, false, test_done);
    });

    function varbinaryTest(batchSize, selectAfterInsert, test_done) {
        var arr = [];
        var str = '';
        for (var i = 0; i < 10; ++i) {
            str = str + i;
            arr.push(new Buffer(str))
        }

        var params = {
            columnType: 'varbinary(100)',
            buildFunction: function (i) {
                var idx = i % 10;
                return arr[idx];
            },
            updateFunction: null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select varbinary column batchSize ' + test1BatchSize, function (test_done) {
        varbinaryTest(test1BatchSize, true, test_done);
    });

    test('bulk insert/select varbinary column batchSize ' + test2BatchSize, function (test_done) {
        varbinaryTest(test2BatchSize, true, test_done);
    });

    function dateTest(batchSize, selectAfterInsert, test_done) {
        var dt = new Date('2002-02-06T00:00:00.000Z');

        var params = {
            columnType: 'datetime',
            buildFunction: function () {
                dt.setTime(dt.getTime() + 86400000);
                var nt = new Date();
                nt.setTime(dt.getTime());
                return nt;
            },
            updateFunction: null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select datetime column batchSize ' + test1BatchSize, function (test_done) {
        dateTest(test1BatchSize, true, test_done);
    });

    test('bulk insert/select datetime column batchSize ' + test2BatchSize, function (test_done) {
        dateTest(test2BatchSize, true, test_done);
    });

    function signedTest(batchSize, selectAfterInsert, runUpdateFunction, test_done) {

        var params = {
            columnType: 'int',
            buildFunction: function (i) {
                return i % 2 == 0 ? -i : i;
            },
            updateFunction: runUpdateFunction ? function (i) {
                return i % 2 == 0 ? -i * 3 : i * 3;
            } : null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select int column of signed batchSize ' + test1BatchSize, function (test_done) {
        signedTest(test1BatchSize, true, false, test_done);
    });

    test('bulk insert/select int column of signed batchSize ' + test2BatchSize, function (test_done) {
        signedTest(test2BatchSize, true, false, test_done);
    });

    test('bulk insert/update/select int column of signed batchSize ' + test2BatchSize, function (test_done) {
        signedTest(test2BatchSize, true, true, test_done);
    });

    function unsignedTest(batchSize, selectAfterInsert, runUpdateFunction, test_done) {

        var params = {
            columnType: 'int',
            buildFunction: function (i) {
                return i * 2;
            },
            updateFunction: runUpdateFunction ? function (i) {
                return i * 3;
            } : null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select int column of unsigned batchSize ' + test1BatchSize, function (test_done) {
        unsignedTest(test1BatchSize, true, false, test_done);
    });

    test('bulk insert/select int column of unsigned batchSize ' + test2BatchSize, function (test_done) {
        unsignedTest(test2BatchSize, true, false, test_done);
    });

    test('bulk insert/select/update int column of unsigned batchSize ' + test2BatchSize, function (test_done) {
        unsignedTest(test2BatchSize, true, true, test_done);
    });

    function bitTest(batchSize, selectAfterInsert, runUpdateFunction, test_done) {

        var params = {
            columnType: 'bit',
            buildFunction: function (i) {
                return i % 2 == 0;
            },
            updateFunction: runUpdateFunction ? function (i) {
                return i % 3 == 0;
            } : null,
            check: selectAfterInsert,
            deleteAfterTest: false,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select bit column batchSize ' + test1BatchSize, function (test_done) {
        bitTest(test1BatchSize, true, false, test_done);
    });

    test('bulk insert/select bit column ' + test2BatchSize, function (test_done) {
        bitTest(test2BatchSize, true, false, test_done);
    });

    test('bulk insert/update/select bit column ' + test2BatchSize, function (test_done) {
        bitTest(test2BatchSize, true, true, test_done);
    });

    function decimalTest(batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, test_done) {

        var params = {
            columnType: 'decimal(18,4)',
            buildFunction: function (i) {
                return (i * 10) + (i * 0.1);
            },
            updateFunction: runUpdateFunction ? function (i) {
                return (i * 1) + (i * 0.2);
            } : null,
            check: selectAfterInsert,
            deleteAfterTest: deleteAfterTest,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select decimal column batchSize ' + test1BatchSize, function (test_done) {
        decimalTest(test1BatchSize, true, false, false, test_done);
    });

    test('bulk insert/select decimal column batchSize ' + test2BatchSize, function (test_done) {
        decimalTest(test2BatchSize, true, false, false, test_done);
    });

    test('bulk insert/select/delete decimal column batchSize ' + test2BatchSize, function (test_done) {
        decimalTest(test2BatchSize, true, true, false, test_done);
    });

    test('bulk insert/update/select decimal column batchSize ' + test2BatchSize, function (test_done) {
        decimalTest(test2BatchSize, true, false, true, test_done);
    });

    function varcharTest(batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, test_done) {
        var arr = [];
        var str = '';
        for (var i = 0; i < 10; ++i) {
            str = str + i;
            arr.push(str)
        }

        var params = {
            columnType: 'varchar(100)',
            buildFunction: function (i) {
                var idx = i % 10;
                return arr[idx];
            },
            updateFunction: runUpdateFunction ? function (i) {
                var idx = 9 - (i % 10);
                return arr[idx];
            } : null,
            check: selectAfterInsert,
            deleteAfterTest: deleteAfterTest,
            batchSize: batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }

    test('bulk insert/select varchar column batchSize ' + test1BatchSize, function (test_done) {
        varcharTest(test1BatchSize, true, false, false, test_done);
    });

    test('bulk insert/select varchar column batchSize ' + test2BatchSize, function (test_done) {
        varcharTest(test2BatchSize, true, false, false, test_done);
    });

    test('bulk insert/select/delete varchar column batchSize ' + test2BatchSize, function (test_done) {
        varcharTest(test2BatchSize, true, true, false, test_done);
    });

    test('bulk insert/update/select varchar column batchSize ' + test2BatchSize, function (test_done) {
        varcharTest(test2BatchSize, true, false, true, test_done);
    });

    test('bulk insert/update/select/delete varchar column batchSize ' + test2BatchSize, function (test_done) {
        varcharTest(test2BatchSize, true, true, true, test_done);
    });


    test('bulk insert simple multi-column object in batches ' + test2BatchSize, function (test_done) {

        function buildTest(count) {
            var arr = [];
            var str = '-';
            for (var i = 0; i < count; ++i) {
                str = str + i;
                if (i % 10 === 0) str = '-';
                var inst = {
                    pkid: i,
                    num1: i * 3,
                    num2: i * 4,
                    num3: i % 2 === 0 ? null : i * 32,
                    st: str
                };
                arr.push(inst);
            }
            return arr;
        }

        var table_name = "BulkTest";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function test(bulkMgr) {
            var batch = totalObjectsForInsert;
            var vec = buildTest(batch);
            bulkMgr.insertRows(vec, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                var s = "select count(*) as count from " + table_name;
                c.query(s, function (err, results) {
                    var expected = [{
                        count: batch
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    test_done();
                });
            }
        }
    });

    function simpleColumnBulkTest(params, test_done) {

        var type = params.columnType;
        var buildFunction = params.buildFunction;
        var updateFunction = params.updateFunction;
        var check = params.check;
        var batchSize = params.batchSize;
        var deleteAfterTest = params.deleteAfterTest;

        var table_name = 'bulkColumn';

        testBoilerPlate({
            name: table_name,
            type: type
        }, go);

        function go() {
            tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function buildTestObjects(batch, functionToRun) {
            var arr = [];

            for (var i = 0; i < batch; ++i) {
                arr.push(
                    {
                        pkid: i,
                        col1: functionToRun(i)
                    }
                )
            }
            return arr;
        }

        function test(bulkMgr) {
            bulkMgr.setBatchSize(batchSize);
            var batch = totalObjectsForInsert;
            var vec = buildTestObjects(batch, buildFunction);
            bulkMgr.insertRows(vec, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                var s = "select count(*) as count from " + table_name;
                c.query(s, function (err, results) {
                    var expected = [{
                        count: batch
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");

                    // if an updater was provided now run it.

                    if (updateFunction != null) {
                        var update = buildTestObjects(batch, updateFunction);
                        bulkMgr.updateRows(update, function (err, res) {
                            assert.ifError(err);
                            assert(res.length == 0);
                            if (check) checkCompare(update, test_done);
                            else test_done();
                        });
                    }
                    else if (check) checkCompare(vec, test_done);
                    else test_done();
                });
            }

            function checkCompare(expected, checkComplete) {
                var fetch = [];
                for (var i = 0; i < expected.length; ++i) {
                    fetch.push({
                        pkid: i
                    })
                }
                bulkMgr.selectRows(fetch, function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    if (deleteAfterTest) {
                        deleteRows(results);
                    } else {
                        checkComplete();
                    }
                });

                function deleteRows(results) {
                    bulkMgr.deleteRows(results, function (err, res) {
                        assert.ifError(err);
                        assert(res.length == 0);
                        checkDeleted();
                    })
                }

                function checkDeleted() {
                    var s = "select count(*) as count from " + table_name;
                    c.query(s, function (err, results) {
                        var expected = [{
                            count: 0
                        }];
                        assert.ifError(err);
                        assert.deepEqual(results, expected, "results didn't match");
                        checkComplete();
                    });
                }
            }
        }
    }



});



