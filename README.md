# Note

This driver is branched from the Microsft node-sqlserver module. The MS team are working on an entirely new version and in the interim this version will be gradually improved to include new features.
# Microsoft / Contributors Node V8 Driver for Node.js for SQL Server

This version includes stored procedure support for SQL Server

1. supports input/output parameters.
2. captures return code from stored procedure.
3. will obtain meta data describing parameters.
4. compatibe with Node 0.12.x 
5. includes 64 bit/ia32 precompiled libraries.
6. npm install with npm install msnodesqlv8
7. new features to be made available over coming months.

## stored procedures

Included in this module is support for stored procedures in SQL server. Simple input/output parameters and return value can be bound.

open a connection, and get an instance of procedureMgr

    sql.open(conn_str, function (err, conn) {
            var pm = conn.procedureMgr();
            pm.callproc('my_proc', [10], function(err, results, output) {
      
    }
    
in above example a call is issued to the stored procedure my_proc which takes one input integer parameter. results will contain rows selected within the procedure and output parameters are inserted into output vector. Note the [0] element in output will be the return result of the procedure. If no return exists in the procedure, this value will be 0. Any further elements in the array will be output parameters populated by the execution of the procedure.

Note the manager will issue a select to the database to obtain meta data about the procedure. This is cached by the manager. It is possible to obtain this information for inspection.

    pm.describe(name, function (meta) {
        console.log(JSON.stringify(meta));
        pm.callproc('my_proc', [10], function (err, results, output) {
       });
    });
    
meta will contain the parameter array associated with the procedure, the type, size and call signature required.

the test folder includes some simple unit tests for stored procedures. If you discover any problems with using this new feature please include a simple example, preferably a unit test illustrating the issue. I will endeavour to fix the issue promptly.

Further enhancements will be made to the library over the coming months - please leave feedback or suggestions for required features.



## Test

Included are a few unit tests.  They require mocha, async, and assert to be 
installed via npm.  Also, set the variables in test-config.js, then run the 
tests as follows:

    cd test
    node runtests.js

## Known Issues





