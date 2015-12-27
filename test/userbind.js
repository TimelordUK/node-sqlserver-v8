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

    test('test user bind Bit(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v bit = ?; select @v as v", [sql.Bit(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind Bit(true)', function(test_done){
        var b = true;
        var expected = b;
        open(function(conn) {
            conn.query("declare @v bit = ?; select @v as v", [sql.Bit(b)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'boolean');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind SSTimeStampOffset(utcDate)', function(test_done) {
        var localDate = new Date();
        var utcDate = new Date(Date.UTC(localDate.getUTCFullYear(),
            localDate.getUTCMonth(),
            localDate.getUTCDate(),
            localDate.getUTCHours(),
            localDate.getUTCMinutes(),
            localDate.getUTCSeconds(),
            0));

        var expected = utcDate;
        open(function(conn) {
            conn.query("declare @v datetime = ?; select @v as v", [sql.SSTimeStampOffset(utcDate)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(test instanceof Date);
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind SSTimeStampOffset(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v datetime = ?; select @v as v", [sql.SSTimeStampOffset(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind WVarChar(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v varchar(20) = ?; select @v as v", [sql.WVarChar(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind WVarChar(\'hello world\')', function(test_done){
        var str = 'hello world';
        var expected = str;
        open(function(conn) {
            conn.query("declare @v varchar(20) = ?; select @v as v", [sql.WVarChar(str)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'string');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind WVarChar(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v varchar(20) = ?; select @v as v", [sql.WVarChar(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

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

    test('test user bind Integer(-1000)', function(test_done){
        var i = 1000;
        var expected = i;
        open(function(conn) {
            conn.query("declare @v int = ?; select @v as v", [sql.Integer(i)], function (err, res) {
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

    test('test user bind BigInt(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v int = ?; select @v as v", [sql.BigInt(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind BigInt(1234567890)', function(test_done){
        var i = 1234567890;
        var expected = i;
        open(function(conn) {
            conn.query("declare @v int = ?; select @v as v", [sql.BigInt(i)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'number');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind Double(null)', function(test_done){
        var expected = null;
        open(function(conn) {
            conn.query("declare @v  decimal(18,4) = ?; select @v as v", [sql.Double(null)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'object');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });

    test('test user bind Double(1234567890.1234)', function(test_done){
        var d = 1234567890.1234;
        var expected = d;
        open(function(conn) {
            conn.query("declare @v decimal(18,4) = ?; select @v as v", [sql.Double(d)], function (err, res) {
                assert.ifError(err);
                var test = res[0]['v'];
                assert(typeof test === 'number');
                assert.deepEqual(test, expected);
                test_done();
            });
        });
    });
});



