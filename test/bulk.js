var supp = require('../demo-support'),
    assert = require('assert'),
    fs = require('fs');

suite('bulk', function () {

    var theConnection;
    this.timeout(20000);
    var tm;
    var conn_str;
    var totalObjectsForInsert = 10;
    var test1BatchSize = 1;
    var test2BatchSize = 10;
    var support;
    var async;
    var helper;

    var sql = global.native_sql;

    setup(function (test_done) {
        supp.GlobalConn.init(sql, function(co) {
            conn_str = co.conn_str;
            support = co.support;
            async = co.async;
            helper =  co.helper;
            helper.setVerbose(false);
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                theConnection = new_conn;
                test_done();
            });
        })
    });

    teardown(function (done) {
        theConnection.close(function (err) {
            assert.ifError(err);
            done();
        });
    });

    test('bulk insert/update/select int column of signed batchSize ' + test2BatchSize, function (test_done) {
        signedTest(test2BatchSize, true, true, function() {
            test_done();
        });
    });

    test('bulk insert/select varbinary column batchSize ' + test1BatchSize, function (test_done) {
        varbinaryTest(test1BatchSize, true, function() {
            test_done();
        });
    });

    test('bulk insert/select varbinary column batchSize ' + test2BatchSize, function (test_done) {
        varbinaryTest(test2BatchSize, true, function() {
            test_done();
        });
    });

    test('bulk insert/select null column of datetime batchSize ' + test2BatchSize, function (test_done) {
        nullTest(test2BatchSize, false, function() {
            test_done();
        });
    });

    test('bulk insert/select null column of datetime batchSize ' + test1BatchSize, function (test_done) {
        nullTest(test1BatchSize, false, function() {
            test_done();
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
        var bulkMgr;
        var vec = buildTest(totalObjectsForInsert);

        var fns = [
            function(async_done) {
                helper.dropCreateTable({
                    name: table_name
                }, function() {
                    async_done();
                })
            },

            function(async_done) {
                var tm = theConnection.tableMgr();
                tm.bind(table_name, function(bm) {
                    bulkMgr = bm;
                    async_done();
                });
            },

            function(async_done) {
                bulkMgr.setBatchSize(totalObjectsForInsert);
                bulkMgr.insertRows(vec, function(err, res) {
                    assert.ifError(err);
                    assert(res.length == 0);
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

     test('employee complex json object array bulk operations', function (test_done) {

         var table_name = "Employee";
         var parsedJSON;

         var bulkMgr;
         var fns = [

             function (async_done) {
                 helper.dropCreateTable({
                     name : table_name
                 }, function () {
                     async_done();
                 });
             },

             function (async_done) {
                 bindInsert(table_name, function (bm, selected) {
                     bulkMgr = bm;
                     parsedJSON = selected;
                     async_done();
                 })
             }
         ];

         async.series(fns, function() {
             test_done();
         })
     });

    function bindInsert(table_name, done) {
        var bulkMgr;
        var parsedJSON = helper.getJSON();
        var keys = helper.extractKey(parsedJSON, 'BusinessEntityID');
        var selected;

        var fns = [
            function (async_done) {
                var tm = theConnection.tableMgr();
                tm.bind(table_name, function (bulk) {
                    bulkMgr = bulk;
                    async_done();
                })
            },

            function (async_done) {
                bulkMgr.insertRows(parsedJSON, function () {
                    async_done();
                });
            },

            function (async_done) {
                bulkMgr.selectRows(keys, function (err, results) {
                    assert.ifError(err);
                    assert(results.length === parsedJSON.length);
                    assert.deepEqual(results, parsedJSON, "results didn't match");
                    selected = results;
                    async_done();
                });
            },
        ];

        async.series(fns, function() {
            done(bulkMgr, selected);
        })
    }

    test('employee insert/select with non primary key', function (test_done) {

        var table_name = "Employee";
        var parsedJSON;
        var whereCols = [
            {
                name: 'LoginID'
            }
        ];

        var bulkMgr;
        var fns = [

            function(async_done) {
                helper.dropCreateTable({
                    name: table_name
                }, function() {
                    async_done();
                });
            },

            function(async_done) {
                bindInsert(table_name,  function(bm, selected) {
                    bulkMgr = bm;
                    parsedJSON = selected;
                    async_done();
                })
            },

            function (async_done) {
                var keys = helper.extractKey(parsedJSON, 'LoginID');
                bulkMgr.setWhereCols(whereCols);
                bulkMgr.selectRows(keys, function (err, results) {
                    assert.ifError(err);
                    assert(results.length === parsedJSON.length);
                    assert.deepEqual(results, parsedJSON, "results didn't match");
                    async_done();
                });
            },
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('employee insert - update a single column', function (test_done) {

        var table_name = "Employee";
        var parsedJSON;
        var updateCols = [];

        updateCols.push({
            name : 'ModifiedDate'
        });
        var newDate = new Date("2015-01-01T00:00:00.000Z");
        var modifications = [];

        var bulkMgr;
        var fns = [

            function (async_done) {
                helper.dropCreateTable({
                    name: table_name
                }, function () {
                    async_done();
                });
            },

            function (async_done) {
                bindInsert(table_name, function (bm, selected) {
                    bulkMgr = bm;
                    parsedJSON = selected;
                    async_done();
                })
            },

            function (async_done) {
                parsedJSON.forEach(function (emp) {
                    emp.ModifiedDate = newDate;
                    modifications.push({
                        BusinessEntityID: emp.BusinessEntityID,
                        ModifiedDate: newDate
                    });
                });
                bulkMgr.setUpdateCols(updateCols);
                bulkMgr.updateRows(modifications, function () {
                    async_done();
                });
            },

            function (async_done) {
                var keys = helper.extractKey(parsedJSON, 'BusinessEntityID');
                bulkMgr.selectRows(keys, function (err, results) {
                    assert.ifError(err);
                    assert(results.length === parsedJSON.length);
                    assert.deepEqual(results, parsedJSON, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function () {
            test_done();
        })
    });

    function nullTest(batchSize, selectAfterInsert, test_done) {

        var params = {
            columnType : 'datetime',
            buildFunction: function () {
                return null;
            },
            updateFunction : null,
            check : selectAfterInsert,
            deleteAfterTest : false,
            batchSize : batchSize
        };

        simpleColumnBulkTest(params, function() {
            test_done();
        })
    }

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
        dateTest(test1BatchSize, true, function() {
            test_done();
        });
    });

    test('bulk insert/select datetime column batchSize ' + test2BatchSize, function (test_done) {
        dateTest(test2BatchSize, true, function() {
            test_done();
        });
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

        simpleColumnBulkTest(params, function() {
            test_done();
        })
    }

    test('bulk insert/select int column of signed batchSize ' + test1BatchSize, function (test_done) {
        signedTest(test1BatchSize, true, false, function() {
            test_done();
        });
    });

    test('bulk insert/select int column of signed batchSize ' + test2BatchSize, function (test_done) {
        signedTest(test2BatchSize, true, false, function() {
            test_done();
        });
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

        simpleColumnBulkTest(params, function() {
            test_done();
        })
    }

    test('bulk insert/select int column of unsigned batchSize ' + test1BatchSize, function (test_done) {
        unsignedTest(test1BatchSize, true, false, function() {
            test_done();
        });
    });

    test('bulk insert/select int column of unsigned batchSize ' + test2BatchSize, function (test_done) {
        unsignedTest(test2BatchSize, true, false, function() {
            test_done();
        });
    });

    test('bulk insert/select/update int column of unsigned batchSize ' + test2BatchSize, function (test_done) {
        unsignedTest(test2BatchSize, true, true, function() {
            test_done();
        });
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

        simpleColumnBulkTest(params, function() {
            test_done();
        })
    }

    test('bulk insert/select bit column batchSize ' + test1BatchSize, function (test_done) {
        bitTest(test1BatchSize, true, false, function() {
            test_done();
        });
    });

    test('bulk insert/select bit column ' + test2BatchSize, function (test_done) {
        bitTest(test2BatchSize, true, false, function() {
            test_done();
        });
    });

    test('bulk insert/update/select bit column ' + test2BatchSize, function (test_done) {
        bitTest(test2BatchSize, true, true, function() {
            test_done();
        });
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

        helper.dropCreateTable({
            name: table_name
        }, go);

        function go() {
            var tm = theConnection.tableMgr();
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
                theConnection.query(s, function (err, results) {
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

    function simpleColumnBulkTest(params, complete_fn) {

        var type = params.columnType;
        var buildFunction = params.buildFunction;
        var updateFunction = params.updateFunction;
        var check = params.check;
        var batchSize = params.batchSize;
        var deleteAfterTest = params.deleteAfterTest;

        var table_name = 'bulkColumn';

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

        var batch = totalObjectsForInsert;
        var toUpdate;
        var toInsert = buildTestObjects(batch, buildFunction);
        if (updateFunction != null) toUpdate = buildTestObjects(batch, updateFunction);
        var skip = false;
        var bulkMgr;

        var fns = [

            function(async_done) {
                helper.dropCreateTable({
                    name : table_name,
                    type : type
                }, function() {
                    async_done();
                });
            },

            function(async_done) {
                tm = theConnection.tableMgr();
                tm.bind(table_name, function(bm) {
                    bulkMgr = bm;
                    async_done();
                })
            },

            function (async_done) {
                bulkMgr.setBatchSize(batchSize);
                bulkMgr.insertRows(toInsert, function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },

            function (async_done) {
                var s = "select count(*) as count from " + table_name;
                theConnection.query(s, function (err, results) {
                    var expected = [{
                        count: batch
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    async_done();
                });
            },

            function (async_done) {
                if (updateFunction == null) {
                    skip = true;
                    async_done();
                }else {
                    bulkMgr.updateRows(toUpdate, function (err, res) {
                        assert.ifError(err);
                        assert(res.length == 0);
                        async_done();
                    });
                }
            },

            function (async_done) {
                if (skip) {
                    async_done();
                    return;
                }
                if (!check) {
                    skip = true;
                    async_done();
                    return;
                }
                var fetch = [];
                for (var i = 0; i < toUpdate.length; ++i) {
                    fetch.push({
                        pkid : i
                    })
                }
                bulkMgr.selectRows(fetch, function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, toUpdate, "results didn't match");
                    async_done();
                });
            },

            function (async_done) {
                if (skip) {
                    async_done();
                    return;
                }
                if (deleteAfterTest == null) {
                    skip = true;
                    async_done();
                    return;
                }
                bulkMgr.deleteRows(toInsert, function (err, res) {
                    assert.ifError(err);
                    assert(res.length == 0);
                    async_done();
                })
            },

            function (async_done) {
                if (skip) {
                    async_done();
                    return;
                }
                var s = "select count(*) as count from " + table_name;
                theConnection.query(s, function (err, results) {
                    var expected = [{
                        count: 0
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function () {
            complete_fn();
        });
    }

    var arr = [];
    function varbinaryTest(batchSize, selectAfterInsert, test_done) {

        var strings = [
            'one',
            'two',
            'three',
            'four',
            'five',
            'six',
            'seven',
            'eight',
            'nine',
            'ten'
        ];

        for (var i = 0; i < 10; ++i) {
            arr.push(new Buffer(strings[i]))
        }

        var params = {
            columnType: 'varbinary(10)',
            buildFunction: function (i) {
                var idx = i % 10;
                return arr[idx];
            },
            updateFunction : null,
            check : selectAfterInsert,
            deleteAfterTest : false,
            batchSize : batchSize
        };

        simpleColumnBulkTest(params, test_done)
    }
});



