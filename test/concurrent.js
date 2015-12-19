var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

suite('concurrent', function () {

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

    test('check for blocked calls to api with event emission', function(test_done){

        var delays = [];
        var start = Date.now();
        var expected = ['a', 'b', 'c', 'd'];
        var seq = [];

        function test() {
            assert.deepEqual(expected, seq);
            test_done();
        }

        function pushTest(c) {
            seq.push(c);
            delays.push(Date.now() - start);
            if (seq.length === expected.length) {
                test();
            }
        }

        open(function(conn1) {
            var req = conn1.query("waitfor delay \'00:00:02\';");
            req.on('done', function() {
                pushTest('a');
                process.nextTick(function() {
                    pushTest('b');
                });
                setImmediate(function() {
                    pushTest('d');
                });
                process.nextTick(function() {
                    pushTest('c');
                });
            })
        });
    });

    test('open connections in sequence and prove distinct connection objects created', function (test_done) {

        var connections = [];

        open(function (conn1) {
            connections.push(conn1);

            open(function (conn2) {
                connections.push(conn2);

                open(function (conn3) {
                    connections.push(conn3);

                    done();
                });
            });
        });

        function done() {
            var c0 = connections[0];
            var c1 = connections[1];
            var c2 = connections[2];

            var t1 = c0 === c1 && c1 === c2;
            assert(t1 === false);
            assert(c0.id != c1.id);
            assert(c1.id != c2.id);

            test_done();
        }
    });

    test('check for blocked calls to api', function (test_done) {

        open(function (conn1) {

            var seq = [];
            var delays = [];
            var start = Date.now();
            var expected = ['a', 'b', 'c', 'd', 'e'];

            function test() {
                assert.deepEqual(expected, seq);
                test_done();
            }

            function pushTest(c) {
                seq.push(c);
                delays.push(Date.now() - start);
                if (seq.length === expected.length) {
                    test();
                }
            }

            pushTest('a');
            process.nextTick(function () {
                pushTest('c');
            });

            conn1.query("waitfor delay \'00:00:02\';", function (res) {
                pushTest('e');
            });

            pushTest('b');
            process.nextTick(function () {
                pushTest('d');
            });
        });
    });

    test('check for blocked calls to api with nested query', function (test_done) {

        open(function (conn1) {

            var seq = [];
            var delays = [];
            var start = Date.now();
            var expected = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

            function test() {
                assert.deepEqual(expected, seq);
                test_done();
            }

            function pushTest(c) {
                seq.push(c);
                delays.push(Date.now() - start);
                if (seq.length === expected.length) {
                    test();
                }
            }

            pushTest('a');
            process.nextTick(function () {
                pushTest('c');
            });
            conn1.query("waitfor delay \'00:00:02\';", [], function (res) {
                pushTest('e');
                pushTest('f');
                process.nextTick(function () {
                    pushTest('h');
                });
                conn1.query("waitfor delay \'00:00:02\';", [], function (res) {
                    pushTest('j');
                });
                pushTest('g');
                process.nextTick(function () {
                    pushTest('i');
                });
            });
            pushTest('b');
            process.nextTick(function () {
                pushTest('d');
            });
        });
    });

    test('open connections simultaneously and prove distinct connection objects created', function (test_done) {

        var connections = [];

        open(function (conn1) {
            connections.push(conn1);
            if (connections.length === 3) done();
        });

        open(function (conn2) {
            connections.push(conn2);
            if (connections.length === 3) done();
        });

        open(function (conn3) {
            connections.push(conn3);
            if (connections.length === 3) done();
        });

        function done() {

            var c0 = connections[0];
            var c1 = connections[1];
            var c2 = connections[2];

            var t1 = c0 === c1 && c1 === c2;
            assert(t1 === false);
            assert(c0.id != c1.id);
            assert(c1.id != c2.id);

            test_done();
        }
    });

    test('make sure two concurrent connections each have unique spid ', function (test_done) {

        var spid1;
        var spid2;

        sql.open(conn_str, function (err, conn1) {
            assert.ifError(err);

            sql.open(conn_str, function (err, conn2) {
                assert.ifError(err);

                conn1.query("select @@SPID as id, CURRENT_USER as name", function (err, res) {
                    assert.ifError(err);
                    assert(res.length == 1);
                    spid1 = res[0]['id'];
                    assert(spid1 != null);

                    conn2.query("select @@SPID as id, CURRENT_USER as name", function (err, res) {
                        assert.ifError(err);
                        assert(res.length == 1);
                        spid2 = res[0]['id'];
                        assert(spid2 != null);
                        assert(spid1 != spid2);
                        test_done();
                    });
                });
            });
        });
    });
});



