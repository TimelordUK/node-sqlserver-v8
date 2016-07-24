
var assert = require('assert');
var supp = require('../demo-support');

suite('sproc', function () {

    var conn_str;
    var theConnection;
    var support;
    var async;
    var helper;
    var driver;
    var database;
    var procedureHelper;
    var sql = global.native_sql;

    this.timeout(20000);

    setup(function (test_done) {
        supp.GlobalConn.init(sql, function (co) {
            conn_str = co.conn_str;
            support = co.support;
            procedureHelper = new support.ProcedureHelper(conn_str);
            procedureHelper.setVerbose(false);
            async = co.async;
            helper = co.helper;
            driver = co.driver;
            database = co.database;
            helper.setVerbose(false);
            sql.open(conn_str, function (err, conn) {
                theConnection = conn;
                assert.ifError(err);
                test_done();
            });
        });
    });

    teardown(function (done) {
        theConnection.close(function (err) {
            assert.ifError(err);
            done();
        });
    });

    test('call proc that waits for delay of input param - wait 5, timeout 2 - should error', function (test_done) {

        var sp_name = "test_spwait_for";

        var def = "alter PROCEDURE <name>"+
            "(\n" +
            "@timeout datetime"+
            "\n)" +
            "AS\n" +
            "BEGIN\n" +
            "waitfor delay @timeout;"+
            "END\n";

        var fns = [
            function(async_done) {
                procedureHelper.createProcedure(sp_name, def, function() {
                    async_done();
                });
            },

            function(async_done) {
                var pm = theConnection.procedureMgr();
                pm.setTimeout(2);
                pm.callproc(sp_name, ['0:0:5'], function(err) {
                    assert(err != null);
                    assert(err.message.indexOf('Query timeout expired') > 0);
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('call proc that waits for delay of input param - wait 2, timeout 5 - should not error', function (test_done) {

        var sp_name = "test_spwait_for";

        var def = "alter PROCEDURE <name>" +
            "(\n" +
            "@timeout datetime" +
            "\n)" +
            "AS\n" +
            "BEGIN\n" +
            "waitfor delay @timeout;" +
            "END\n";

        var fns = [
            function (async_done) {
                procedureHelper.createProcedure(sp_name, def, function () {
                    async_done();
                });
            },

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.setTimeout(5);
                pm.callproc(sp_name, ['0:0:2'], function (err) {
                    assert.ifError(err);
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('call proc that returns length of input string and decribes itself in results', function (test_done) {

        var sp_name = "test_sp";

        var def = "alter PROCEDURE <name> @param VARCHAR(50) \n"
            + " AS \n"
            + " BEGIN \n"
            + "     SELECT name, type, type_desc  FROM sys.objects WHERE type = 'P' AND name = '<name>'"
            + "     RETURN LEN(@param); \n"
            + " END \n";

        var fns = [
            function (async_done) {
                procedureHelper.createProcedure(sp_name, def, function () {
                    async_done();
                });
            },

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.callproc(sp_name, ["US of A!"], function (err, results, output) {
                    var expected = [8];
                    assert.deepEqual(output, expected, "results didn't match");
                    expected = [
                        {
                            name: sp_name,
                            type: 'P ',
                            type_desc: 'SQL_STORED_PROCEDURE'
                        }];
                    assert.deepEqual(results, expected, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('call proc that returns length of input string', function (test_done) {

        var sp_name = "test_sp";

        var def = "alter PROCEDURE <name> @param VARCHAR(50) \n"
            + " AS \n"
            + " BEGIN \n"
            + "     RETURN LEN(@param); \n"
            + " END \n";

        var fns = [
            function (async_done) {
                procedureHelper.createProcedure(sp_name, def, function () {
                    async_done();
                });
            },

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.callproc(sp_name, ["US of A!"], function (err, results, output) {
                    var expected = [8];
                    assert.deepEqual(output, expected, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('call proc that has 2 output string params + return code', function (test_done) {

        var sp_name = "test_sp_get_str_str";

        var def = "alter PROCEDURE <name>" +
            "(\n" +
            "@id INT,\n" +
            "@name varchar(20) OUTPUT,\n" +
            "@company varchar(20) OUTPUT\n" +
            "\n)" +
            "AS\n" +
            "BEGIN\n" +
            "   SET @name = 'name'\n" +
            "   SET @company = 'company'\n" +
            "   RETURN 99;\n" +
            "END\n";

        var fns = [
            function (async_done) {
                procedureHelper.createProcedure(sp_name, def, function () {
                    async_done();
                });
            },

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.callproc(sp_name, [1], function (err, results, output) {
                    var expected = [99, 'name', 'company'];
                    assert.deepEqual(output, expected, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        })
    });

    test('call proc that has 2 input params + 1 output', function (test_done) {

        var sp_name = "test_sp_get_int_int";

        var def = "alter PROCEDURE <name>"+
            "(\n" +
            "@num1 INT,\n" +
            "@num2 INT,\n" +
            "@num3 INT OUTPUT\n" +
            "\n)" +
            "AS\n" +
            "BEGIN\n" +
            "   SET @num3 = @num1 + @num2\n"+
            "   RETURN 99;\n"+
            "END\n";

        var fns = [
            function (async_done) {
                procedureHelper.createProcedure(sp_name, def, function () {
                    async_done();
                });
            },

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.callproc(sp_name, [10, 5], function (err, results, output) {
                    var expected = [99, 15];
                    assert.deepEqual(output, expected, "results didn't match");
                    async_done();
                });
            }
        ];

        async.series(fns, function() {
            test_done();
        });
    });
});