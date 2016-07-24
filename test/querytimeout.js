
var  assert = require('assert'),
    supp = require('../demo-support'),
    fs = require('fs');

suite('querytimeout', function () {

    this.timeout(20 * 1000);
    var sql = global.native_sql;

    var theConnection;
    var conn_str;
    var support;
    var async;
    var helper;

    setup(function (test_done) {
        supp.GlobalConn.init(sql, function (co) {
            conn_str = co.conn_str;
            support = co.support;
            async = co.async;
            helper = co.helper;
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

    test('test timeout 2 secs on waitfor delay 10', function (test_done) {
        var queryObj = {
            query_str : "waitfor delay \'00:00:10\';",
            query_timeout : 2
        };

        theConnection.query(queryObj, function (err) {
            assert(err != null);
            assert(err.message.indexOf('Query timeout expired') > 0);
            test_done();
        });
    });

    test('test timeout 10 secs on waitfor delay 2', function (test_done) {
        var queryObj = {
            query_str : "waitfor delay \'00:00:2\';",
            query_timeout : 10
        };

        theConnection.query(queryObj, function (err) {
            assert.ifError(err);
            test_done();
        });
    });

    test('test timeout 0 secs on waitfor delay 4', function (test_done) {

        var queryObj = {
            query_str: "waitfor delay \'00:00:4\';"
        };

        theConnection.query(queryObj, function (err) {
            assert.ifError(err);
            test_done();
        });
    });
});



