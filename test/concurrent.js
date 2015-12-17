var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

suite('concurrent', function () {

    var c;
    this.timeout(25 * 1000);

    setup(function (test_done) {
        test_done();
    });

    teardown(function (done) {
        done();
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



