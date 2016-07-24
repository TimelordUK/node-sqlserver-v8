//---------------------------------------------------------------------------------------------------------------------------------
// File: prepared.js
// Contents: test suite for queries
//
// Copyright Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

var supp = require('../demo-support'),
    assert = require('assert'),
    fs = require('fs');

function empSelectSQL() {

    return `SELECT [BusinessEntityID]
     ,[NationalIDNumber]
     ,[LoginID]
     ,[OrganizationNode]
     ,[OrganizationLevel]
     ,[JobTitle]
     ,[BirthDate]
     ,[MaritalStatus]
     ,[Gender]
     ,[HireDate]
     ,[SalariedFlag]
     ,[VacationHours]
     ,[SickLeaveHours]
     ,[CurrentFlag]
     ,[rowguid]
     ,[ModifiedDate]
     FROM [scratch].[dbo].[Employee]
     WHERE BusinessEntityID = ?`;
}

function empDeleteSQL() {

    return `DELETE FROM [scratch].[dbo].[Employee]
        WHERE BusinessEntityID = ?`;
}

function empNoParamsSQL() {

    return `SELECT [BusinessEntityID]
     ,[NationalIDNumber]
     ,[LoginID]
     ,[OrganizationNode]
     ,[OrganizationLevel]
     ,[JobTitle]
     ,[BirthDate]
     ,[MaritalStatus]
     ,[Gender]
     ,[HireDate]
     ,[SalariedFlag]
     ,[VacationHours]
     ,[SickLeaveHours]
     ,[CurrentFlag]
     ,[rowguid]
     ,[ModifiedDate]
     FROM [scratch].[dbo].[Employee]`;
}

suite('prepared', function () {

    var conn_str;
    var theConnection;
    var support;
    var async;
    var helper;
    var driver;
    var database;
    var procedureHelper;
    var prepared;
    var parsedJSON;
    var sql = global.native_sql;
    this.timeout(10000);

    var actions = [
        // open a connection.
        function (async_done) {
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                theConnection = new_conn;
                async_done();
            });
        },

        // drop / create an Employee table.
        function (async_done) {
            helper.dropCreateTable({
                name: table_name
            }, function () {
                async_done();
            });
        },

        // insert test set using bulk insert
        function (async_done) {
            var tm = theConnection.tableMgr();
            tm.bind(table_name, function (bulkMgr) {
                bulkMgr.insertRows(parsedJSON, function () {
                    async_done();
                });
            });
        },

        // prepare a select statement.
        function (async_done) {
            employeePrepare(empSelectSQL(), function (ps) {
                prepared.select = ps;
                async_done();
            })
        },

        // prepare a select all statement.
        function (async_done) {
            employeePrepare(empNoParamsSQL(), function (ps) {
                prepared.scan = ps;
                async_done();
            })
        },

        // prepare a delete statement.
        function (async_done) {
            employeePrepare(empDeleteSQL(), function (ps) {
                prepared.delete = ps;
                async_done();
            })
        }
    ];

    var table_name = "Employee";

    setup(function (test_done) {

        prepared = {
            select: null,
            delete: null,
            scan: null
        };

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
            parsedJSON = helper.getJSON();
            async.series(actions,
                function () {
                    test_done();
                });
        });
    });

    teardown(function (done) {

        var fns = [
            function (async_done) {
                prepared.select.free(function () {
                    async_done();
                });
            },
            function (async_done) {
                prepared.delete.free(function () {
                    async_done();
                });
            },
            function (async_done) {
                theConnection.close(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            }
        ];

        async.series(fns, function () {
            done();
        })
    });

    function employeePrepare(query, done) {
        theConnection.prepare(query, function (err, ps) {
            assert.ifError(err);
            done(ps);
        });
    }

    test('use prepared statement twice with no parameters.', function (test_done) {
        var select = prepared.scan;
        var meta = select.getMeta();
        assert(meta.length > 0);
        select.preparedQuery(function (err, res1) {
            assert.ifError(err);
            assert.deepEqual(parsedJSON, res1, "results didn't match");
            select.preparedQuery(function (err, res2) {
                assert.ifError(err);
                assert.deepEqual(parsedJSON, res2, "results didn't match");
                test_done();
            })
        });
    });

    test('use prepared statements to select a row, then delete it over each row.', function (test_done) {

        var select = prepared.select;
        var meta = select.getMeta();
        assert(meta.length > 0);
        var remove = prepared.delete;
        var max = parsedJSON[parsedJSON.length - 1].BusinessEntityID;
        var businessId = 1;
        next(businessId, iterate);

        function iterate() {
            businessId++;
            if (businessId > max) check();
            else next(businessId, iterate);
        }

        function check() {
            theConnection.query("select count(*) as rows from Employee", function (err, res) {
                assert.ifError(err);
                assert(res[0].rows == 0);
                test_done();
            });
        }

        function next(businessId, done) {
            select.preparedQuery([businessId], function (err, res1) {
                assert.ifError(err);
                var fetched = parsedJSON[businessId - 1];
                assert.deepEqual(fetched, res1[0], "results didn't match");
                remove.preparedQuery([businessId], function (err) {
                    assert.ifError(err);
                    done();
                })
            });
        }
    });

    test('stress test prepared statement with 500 invocations cycling through primary key', function (test_done) {

        var select = prepared.select;
        var meta = select.getMeta();
        assert(meta.length > 0);
        var businessId = 1;
        var iteration = 0;
        var totalIterations = 500;
        var max = parsedJSON[parsedJSON.length - 1].BusinessEntityID;
        next(businessId, iterate);

        function iterate() {
            businessId++;
            if (businessId > max) businessId = 1;
            ++iteration;
            if (iteration < totalIterations) {
                next(businessId, iterate);
            } else {
                test_done();
            }
        }

        function next(businessId, done) {
            select.preparedQuery([businessId],
                function (err, res1) {
                    assert.ifError(err);
                    assert(res1[0].BusinessEntityID == businessId);
                    done();
                });
        }
    });

    test('use prepared statement twice with different params.', function (test_done) {

        var select = prepared.select;
        var meta = select.getMeta();
        var id1 = 2;
        var id2 = 3;
        assert(meta.length > 0);
        select.preparedQuery([id1], function (err, res1) {
            assert.ifError(err);
            select.preparedQuery([id2], function (err, res2) {
                assert.ifError(err);
                var o1 = parsedJSON[id1 - 1];
                assert.deepEqual(o1, res1[0], "results didn't match");

                var o2 = parsedJSON[id2 - 1];
                assert.deepEqual(o2, res2[0], "results didn't match");
                test_done();
            })
        });
    });
});
