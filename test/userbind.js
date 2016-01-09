var sql = require('../'),
    assert = require('assert'),
    async = require('async'),
    config = require('./test-config'),
    fs = require('fs');

var conn_str = config.conn_str;

suite('userbind', function () {

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
            done(conn);
        });
    };

    function testUserBind(params, cb) {

        open(function (conn) {

            var allres = [];

            var sequence = [

                function (async_done) {
                    conn.query(params.query, [params.setter(params.min)], function (err, res) {
                        if (err) {
                            cb(err, res);
                        }
                        allres.push(res[0]);
                        async_done();
                    });
                },

                function (async_done) {
                    conn.query(params.query, [params.setter(params.max)], function (err, res) {
                        if (err) {
                            cb(err, res);
                        }
                        allres.push(res[0]);
                        async_done();
                    });
                },

                function (async_done) {
                    conn.query(params.query, [params.setter(null)], function (err, res) {
                        if (err) {
                            cb(err, res);
                        }
                        allres.push(res[0]);
                        async_done();
                    });
                },

                function (async_done) {
                    async_done();
                }];

            async.series(sequence,
                function () {
                    cb(null, allres);
                });
        });
    }

    function compare(params, res) {

        var min = params.expected != null ? params.expected[0] : params.min;
        var max = params.expected != null ? params.expected[1] : params.max;
        var expected = [
            {v: min},
            {v: max},
            {v: null}
        ];

        assert.deepEqual(res, expected);
    }

    test('user bind well formatted xml', function (test_done) {
        var params = {
            query: 'declare @v xml = ?; select @v as v',
            min: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car></Cars>',
            max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car><Car id="5678"><Make>Honda</Make><Model>CRV</Model><Year>2009</Year><Color>Black</Color><Mileage>35,600</Mileage></Car></Cars>',
            setter: function (v) {
                return sql.Xml(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind xml - bad xml should give error', function (test_done) {
        var params = {
            query: 'declare @v xml = ?; select @v as v',
            min: '',
            max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Cars>',
            setter: function (v) {
                return sql.Xml(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ok(err.message.indexOf('end tag does not match start tag') > 0);
            test_done();
        });
    });

    test('user bind nchar - check truncated user strings (1)', function (test_done) {
        var params = {
            query: 'declare @v nchar(5) = ?; select @v as v',
            min: 'five',
            max: 'hello world',
            expected: [
                'five ',
                'hello'
            ],

            setter: function (v) {
                return sql.NChar(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind Char - check truncated user strings (1)', function (test_done) {
        var params = {
            query: 'declare @v char(5) = ?; select @v as v',
            min: 'five',
            max: 'hello world',
            expected: [
                'five ',
                'hello'
            ],
            setter: function (v) {
                return sql.Char(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind Char - returned string will be padded (2)', function (test_done) {
        var params = {
            query: 'declare @v char(5) = ?; select @v as v',
            min: 'h',
            max: 'world',
            expected: [
                'h    ',
                'world'
            ],
            setter: function (v) {
                return sql.Char(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind Char - use precision to clip user string (3)', function (test_done) {
        var params = {
            query: 'declare @v char(11) = ?; select @v as v',
            min: 'h',
            max: 'world',
            expected: [
                'h' + new Array(11).join(" "),
                'wo'  + new Array(10).join(" ")
            ],
            setter: function (v) {
                return sql.Char(v, 2);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind NVarChar /16 bit encoded', function (test_done) {
        var params = {
            query: 'declare @v varchar(100) = ?; select @v as v',
            min: 'hello',
            max: 'world',
            expected: [
                'hello',
                'world'
            ],
            setter: function (v) {
                return sql.NVarChar(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind float, maps to numeric data structure.', function (test_done) {
        var params = {
            query: 'declare @v float = ?; select @v as v',
            min: -1.7976931348623158E+308,
            max: 1.7976931348623158E+308,
            setter: function (v) {
                return sql.Float(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });


    test('user bind double, maps to numeric data structure.', function (test_done) {
        var params = {
            query: 'declare @v float = ?; select @v as v',
            min: -1.7976931348623158E+308,
            max: 1.7976931348623158E+308,
            setter: function (v) {
                return sql.Float(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind bit', function (test_done) {
        var params = {
            query: 'declare @v bit = ?; select @v as v',
            min: false,
            max: true,
            setter: function (v) {
                return sql.Bit(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind bigint', function (test_done) {

        var params = {
            query: 'declare @v bigint = ?; select @v as v',
            min: -9007199254740991,
            max: 9007199254740991,
            setter: function (v) {
                return sql.BigInt(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind int', function (test_done) {

        var params = {
            query: 'declare @v int = ?; select @v as v',
            min: -2147483648,
            max: 2147483647,
            setter: function (v) {
                return sql.Int(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind tinyint', function (test_done) {

        var params = {
            query: 'declare @v tinyint = ?; select @v as v',
            min: 0,
            max: 255,
            setter: function (v) {
                return sql.TinyInt(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });

    test('user bind smallint', function (test_done) {

        var params = {
            query: 'declare @v smallint = ?; select @v as v',
            min: -32768,
            max: 32767,
            setter: function (v) {
                return sql.SmallInt(v);
            }
        };
        testUserBind(params, function (err, res) {
            assert.ifError(err);
            compare(params, res);
            test_done();
        });
    });
});



