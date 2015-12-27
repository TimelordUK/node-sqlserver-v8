var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

suite('userbind', function () {

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

    test('test user bind Integer(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v int = ?; select @v as v", [sql.Integer(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind Integer(100)', function(test_done){
        var expected = 100;
        open(function(conn) {
            conn.query("declare @v int = ?; select @v as v", [sql.Integer(100)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'number');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind VarBinary([0,1,2,3])', function(test_done){
       var vec = [0, 1, 2, 3];
        var expected = new Buffer(vec);
        open(function(conn) {
            conn.query("declare @v binary(4) = ?; select @v as v", [sql.VarBinary(new Buffer(vec))], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(test instanceof Buffer);
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind VarBinary(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v binary(4) = ?; select @v as v", [sql.VarBinary(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });
});



