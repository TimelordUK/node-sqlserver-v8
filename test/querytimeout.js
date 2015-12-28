var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

suite('querytimeout', function () {

    var c;
    this.timeout(20 * 1000);

    setup(function (test_done) {
        test_done();
    });

    teardown(function (done) {
        done();
    });

    var open = function (done) {
        sql.open(conn_str, function (err, conn) {
            if (err) {
                console.error(err);
                process.exit();
            }
            ;
            done(conn);
        });
    };

    test('test timeout 2 secs on waitfor delay 10', function(test_done){
        open(function(conn) {
            var queryObj = {
                query_str : "waitfor delay \'00:00:10\';",
                query_timeout : 2
            };
            Error
            conn.query(queryObj, function (err, res) {
                assert(err != null);
                assert(err.message.indexOf('Query timeout expired') > 0)
                test_done();
            });
        });
    });

    test('test timeout 10 secs on waitfor delay 2', function(test_done){
        open(function(conn) {
            var queryObj = {
                query_str : "waitfor delay \'00:00:2\';",
                query_timeout : 10
            };
            Error
            conn.query(queryObj, function (err, res) {
                assert(err === null);
                test_done();
            });
        });
    });

    test('test timeout 0 secs on waitfor delay 4', function(test_done){
        open(function(conn) {
            var queryObj = {
                query_str : "waitfor delay \'00:00:4\';",
                query_timeout : 0
            };
            Error
            conn.query(queryObj, function (err, res) {
                assert(err === null);
                test_done();
            });
        });
    });
});



