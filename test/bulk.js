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

                readFile(file, function (createSql) {
                    createSql = createSql.replace(/<name>/g, name);
                    var arr = createSql.split("GO");
                    for (var i = 0; i < arr.length; ++i) {
                        arr[i] = arr[i].replace(/^\s+|\s+$/g, '');
                    }
                    inChunks(arr, function() {
                        async_done();
                    });
                });
            },

            function (async_done) {
                var tm = conn.tableMgr();
                tm.bind(name, function(bulkMgr) {
                    assert(bulkMgr.columns.length === 16, "Error creating table");
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

    test('insert bulk rows to table', function (test_done) {

        var table_name = "Employee";

        testBoilerPlate(table_name, go);

        function go() {
            var tm = c.tableMgr();
        }
    });
});



