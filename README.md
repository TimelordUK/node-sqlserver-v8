# Note

This driver is branched from the Microsft node-sqlserver module. The MS team are working on an entirely new version and in the interim this version will be gradually improved to include new features.
# Microsoft / Contributors Node V8 Driver for Node.js for SQL Server

This version includes stored procedure support and bulk insert/delete/amend for SQL Server

1. supports input/output parameters.
2. captures return code from stored procedure.
3. will obtain meta data describing parameters.
4. compatibe with Node 0.12.x / 4.x.x / 5.x.x / 6.x.x
5. includes 64 bit/ia32 precompiled libraries.
6. npm install with npm install msnodesqlv8
7. new features to be made available over coming months.
8. bulk table operations insert,delete,update

# **NODE-SQLSERVER-V8**

## Node JS support for SQL server 

Based on node-sqlserver, this version will compile in Visual Studio 2013/2015 and is built against the v8 node module API.  The module will work against node version 0.12.x. and >= 4.1.x.    Included in the repository are pre compiled binaries for both x64 and x86 targets.  

Functionally the API should work exactly as the existing library. The existing unit tests pass based on Node 0.12 and also against Node 4.2.1.

## Node >= 5.12.0

The library has been built against the latest Node 5 version.  The test cases pass OK.

## Node >= 6.2.2

The library has been built against the latest Node 6 version.  The test cases pass OK, please take library for a spin. Note native libraries have been included, it should work out the box.

## Prepared Statements

It is now possible to prepare one or more statements which can then be invoked
over and over with different parameters.  There are a few examples in the prepared unit tests.
Please note that prepared statements must be closed as shown below when they are no longer required.
Each prepared statement utilises server resources so the application should open and close appropriately.

Prepared Statements can be useful when there is a requirement to run the same SQL with different
parameters many times.  This saves overhead from constantly submitting the same SQL to the server.

    function employeePrepare(done) {

    var query =
        `SELECT [ModifiedDate]
        ,[BusinessEntityID]
        ,[OrganizationNode]
        ,[ModifiedDate]
        FROM [scratch].[dbo].[Employee]
        WHERE BusinessEntityID = ?`;

    // open connection
    sql.open(connStr, function (err, conn) {
        assert.ifError(err);
        // prepare a statement which can be re-used
        conn.prepare(query, function (e, ps) {
            // called back with a prepared statement
            console.log(ps.getMeta());
            // prepared query meta data avaialble to view
            assert.ifError(err);
            // execute with expected paramater
            ps.preparedQuery([1], function(err, fetched) {
                console.log(fetched);
                // can call again with new parameters.
                // note - free the statement when no longer used,
                // else resources will be leaked.
                ps.free(function() {
                    done();
                })
            });
        });
    });
    }



## Connect Timeout

send in a connect object to pass a timeout to the driver for connect request

    function connect_timeout() {
        var co = {
            conn_str : connStr,
            conn_timeout : 2
        };
        var start = new Date().getTime();
        console.log ('connect ' + start);
        sql.open(co, function(err, conn) {
            var end = new Date().getTime();
            var elapsed = end - start;
            console.log ('callback ..... ' + elapsed );
            if (err) {
                console.log(err);
                return;
            }
            var ts = new Date().getTime();
            conn.query("declare @v time = ?; select @v as v", [sql.Time(ts)], function (err, res) {
                assert.ifError(err);
                console.log(res);
            });
        });

## Query Timeout

send in a query object such as that shown below to set a timeout for a particular query.  Note usual semantics of using a sql string parameter will result in no timeout being set

        open(function(conn) {
            var queryObj = {
                query_str : "waitfor delay \'00:00:10\';",
                query_timeout : 2
            };

            conn.query(queryObj, function (err, res) {
                assert(err != null);
                assert(err.message.indexOf('Query timeout expired') > 0)
                test_done();
            });
        });

A timeout can also be used with a stored procedure call as follows :-

        function go() {
            var pm = c.procedureMgr();
            pm.setTimeout(2);
            pm.callproc(sp_name, ['0:0:5'], function(err, results, output) {
                assert(err != null);
                assert(err.message.indexOf('Query timeout expired') > 0)
                test_done();
            });
        }

## User Binding Of Parameters

In many cases letting the driver decide on the parameter type is sufficient.  There are occasions however where more control is required. The API now includes some methods which explicitly set the type alongside the value.  The driver will in this case
use the type as provided.  For example, to set column type as binary and pass in null value, use the sql.VarBinary as shown below.  There are more examples in test harness file userbind.js.

     sql.open(connStr, function(err, conn) {
         conn.query("declare @bin binary(4) = ?; select @bin as bin", [sql.VarBinary(null)], function (err, res) {
             var expected = [ {
                 'bin' : null
             }];
             assert.ifError(err);
             assert.deepEqual(expected, res);
         });
     });

## Stored Procedure Support 

Included in this module is support for stored procedures in SQL server.  Simple input/output parameters and return value can be bound.  

open a connection, and get an instance of procedureMgr

        sql.open(conn_str, function (err, conn) {
                var pm = conn.procedureMgr();
                pm.callproc('my_proc', [10], function(err, results, output) {
            });
        });

in above example a call is issued to the stored procedure my_proc which takes one input integer parameter.  results will contain rows selected within the procedure and output parameters are inserted into output vector.  Note the [0] element in output will be the return result of the procedure.  If no return exists in the procedure, this value will be 0.  Any further elements in the array will be output parameters populated by the execution of the procedure.

Note the manager will issue a select to the database to obtain meta data about the procedure.  This is cached by the manager.  It is possible to obtain this information for inspection.

    pm.describe(name, function (meta) {
        console.log(JSON.stringify(meta));
        pm.callproc('my_proc', [10], function (err, results, output) {
        });
    });

meta will contain the parameter array associated with the procedure, the type, size and call signature required.  

the test folder includes some simple unit tests for stored procedures.  If you discover any problems with using this new feature please include a simple example, preferably a unit test illustrating the issue.  I will endeavour to fix the issue promptly.

Further enhancements will be made to the library over the coming months - please leave feedback or suggestions for required features.

## Bulk Table Operations

Bulk insert/delete/modify is now supported through a helper class.  The underlying c++ driver will reserve vectors containing the column data and submit in bulk to the database which will reduce network overhead.  It is possible to configure in the java script a batch size which will break the master vector of objects down into batches each of which is prepared and sent by the driver. Most of the effort for this update was spent in getting the c++ driver to work, the js API still needs a little refinement, so please use the feature and make suggestions for improvements.

If issues are found, please provide the exact table definition being used and ideally a unit test illustrating the problem. 

take a look at the unit test file bulk.js to get an idea of how to use these new functions.

once a connection is opened, first get the table manager :-

            var tm = c.tableMgr();
            tm.bind('Employee', cb);

the table manager will fetch some meta data describing the table 'Employee' and make a callback providing a manager for that particular table :-

            function cb(bulkMgr) {
              // bulkMgr is now ready to accept bulk operations for table 'Employee'
              // see employee.json and employee.sql in test.
              var parsedJSON = getJSON(); // see bulk.js
              bulkMgr.insertRows(parsedJSON, insertDone);
            }

you can look at the signatures, columns and other interesting information by asking for a summary :-

             var summary = bulkMgr.getSummary();

by default the primary key of the table is assigned to the where condition for select which gives a convenient way of selecting a set of rows based on knowing the keys.  Note this operation is not yet optimized with bulk fetch, which will be enhanced in the next update addressing cursors.

             keys = [];
             keys.push(
                 {
                     BusinessEntityID : 1  
                 }
             );
             bulkMgr.selectRows(keys, function(err, results) {
                 // results will contain the full object i.e. all columns,
             }
             ); 

it is possible to change the where clause by using a different column signature - for example, LoginID

            var whereCols = [];
            whereCols.push({
                name : 'LoginID'
            });
            // as above keys now needs to contain a vector of LoginID
            bulkMgr.setWhereCols(whereCols);
            bulkMgr.selectRows(keys, bulkDone);
 
amends can be made to a sub set of columns, for example to bulk update the modified date, prepare a set of objects with the primary keys to satisfy the where clause and of course the column to be updated. By default all assignable columns are used for the update signature so the entire object would need to be presented.  Where performance is within acceptable limits, this is probably the easiest pattern i.e. select the entire object, amend as required and commit the amended vector back to the database.


                var newDate = new Date("2015-01-01T00:00:00.000Z");
                var modifications = [];
                parsedJSON.forEach(function(emp) {
                    emp.ModifiedDate = newDate;
                    modifications.push( {
                        BusinessEntityID : emp.BusinessEntityID,
                        ModifiedDate : newDate
                    });
                });

tell the bulkMgr which columns to use for the update and send in the modification :-

                var updateCols = [];
                updateCols.push({
                    name : 'ModifiedDate'
                });

                bulkMgr.setUpdateCols(updateCols);
                bulkMgr.updateRows(modifications, updateDone);

the manager can also delete rows - the where clause is used in binding signature so by default this will be the primary key.  Similar to the select examples above :-

                 bulkMgr.deleteRows(keys, function (err, res) {
                 })

of course keys can be the original objects as fetched with select - the driver only needs all columns that satisfy the where condition of the signature.


finally, to reset the signatures the summary can help :-

                 var summary = bulkMgr.getSummary();
                 bulkMgr.setWhereCols(summary.primaryColumns);
                 bulkMgr.setUpdateCols(summary.assignableColumns);

 
Further enhancements will be made to the library over the coming months - please leave feedback or suggestions for required features.

## Test

Included are a few unit tests.  They require mocha, async, and assert to be 
installed via npm.  Also, set the variables in test-config.js, then run the 
tests as follows:

    cd test
    node runtests.js

note if you wish to run the code through an IDE such as PHPStorm, the following fragment may help :-

    function runTest() {

    var mocha = new Mocha(
        {
            ui : 'tdd'
        });

    -- change path as required to unit test file, set breakpoint and run via IDE
    
    mocha.addFile('node_modules/node-sqlserver-v8/test/huge-bulk.js');

    mocha.run(function (failures) {
        process.on('exit', function () {
            process.exit(failures);
        });
    });


## Known Issues







