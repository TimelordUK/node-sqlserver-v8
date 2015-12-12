var sql = require('../'),
    uuid = require('node-uuid'),
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

suite('huge-bulk', function () {

    var c;
    this.timeout(60 * 15 * 1000);

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

    test('bulk insert simple multi-column object ', function (test_done) {

        var table_name = "template";

        testBoilerPlate({
            name: table_name
        }, go);

        function go() {
            var tm = c.tableMgr();
            tm.bind(table_name, test);
        }

        function buildTest(bm, size) {

            var ds = [];
            var dt = new Date('2002-02-06T00:00:00.000Z');
            var summary = bm.getSummary();
            var cols = summary.assignableColumns;
            for (var i = 0; i < size; ++i) {
                var r = {};
                cols.forEach(function (c) {
                    if (c.type === 'nvarchar') {
                        r[c.name] = uuid.v4();
                    }else if (c.type === 'bit') {
                        r[c.name] = i % 2 === 0;
                    }else if (c.type === 'decimal') {
                        r[c.name] = i * 1.1;
                    }else if (c.type === 'datetime') {
                        dt.setTime(dt.getTime() + 1000);
                        var nt = new Date();
                        nt.setTime(dt.getTime());
                        r[c.name] = nt;
                    }else if (c.type === 'date') {
                        var nt = new Date();
                        nt.setDate(dt.getDate());
                        r[c.name] = nt;
                    }else if (c.type === 'int') {
                        r[c.name] = ds.length;
                    }else {
                        r[c.name] = null;
                    }
                });
                ds[ds.length] = r;
            }

            return ds;
        }


        function test(bulkMgr) {

            var rowCount = 250000;
            var batchSize =  25000;

            bulkMgr.setBatchSize(batchSize);

            var vec = buildTest(bulkMgr, rowCount);
            bulkMgr.insertRows(vec, insertDone);

            function insertDone(err, res) {
                assert.ifError(err);
                assert(res.length == 0);
                var s = "select count(*) as count from " + table_name;
                c.query(s, function (err, results) {
                    var expected = [{
                        count: rowCount
                    }];
                    assert.ifError(err);
                    assert.deepEqual(results, expected, "results didn't match");
                    test_done();
                });
            }
        }
    });
});



