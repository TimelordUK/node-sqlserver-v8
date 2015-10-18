var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

function testBoilerPlate(name, doneFunction) {

    sql.open(conn_str, opened);

    function opened(err, conn) {
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
                var file = folder + '/' + name;
                file += '.sql';

                function inChunks(arr, callback) {
                    var i = 0;
                    conn.query(arr[i], next);
                    function next(err, res) {
                        ++i;
                        if (i < arr.length)
                            conn.query(arr[i], next);
                        else callback();
                    }
                }

                // submit the SQL one chunk at a time to create table with constraints.
                readFile(file, function (createSql) {
                    createSql = createSql.replace(/<name>/g, name);
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

    test('employee bulk operations', function (test_done) {

        var table_name = "Employee";

        testBoilerPlate(table_name, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function patch(parsedJSON) {
            for (var i = 0; i < parsedJSON.length; ++i) {
                parsedJSON[i].OrganizationNode = new Buffer(parsedJSON[i].OrganizationNode.data, 'utf8');
                parsedJSON[i].BirthDate = new Date(parsedJSON[i].BirthDate);
                parsedJSON[i].HireDate = new Date(parsedJSON[i].HireDate);
                parsedJSON[i].ModifiedDate = new Date(parsedJSON[i].ModifiedDate);
            }

            var keys = [];
            parsedJSON.forEach(function (emp) {
                keys.push({
                    BusinessEntityID: emp.BusinessEntityID
                });
            });
            return keys;
        }

        function test(bulkMgr) {

            var folder = __dirname;
            var parsedJSON = require(folder + '/employee.json');
            var keys = patch(parsedJSON);

            bulkMgr.insertRows(parsedJSON, insertDone);

            function insertDone(err,res) {
                assert.ifError(err);
                assert(res.length == 0);
                bulkMgr.selectRows(keys, bulkDone);
            }

            function bulkDone(err, results) {
                assert(results.length === 10);
                assert.deepEqual(results, parsedJSON, "results didn't match");
                test_done();
            }
        }
    });
});



