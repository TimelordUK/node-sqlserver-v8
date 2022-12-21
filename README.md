# msnodesqlv8

[![Build status](https://ci.appveyor.com/api/projects/status/7swf644d37pqdmuj/branch/master?svg=true)](https://ci.appveyor.com/project/TimelordUK/node-sqlserver-v8/branch/master) [![npm version](https://badge.fury.io/js/msnodesqlv8.svg)](https://badge.fury.io/js/msnodesqlv8)
[![GitHub stars](https://img.shields.io/github/stars/TimelordUK/node-sqlserver-v8.svg)](https://github.com/TimelordUK/node-sqlserver-v8/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/TimelordUK/node-sqlserver-v8.svg)](https://github.com/TimelordUK/node-sqlserver-v8/issues)
[![npm](https://img.shields.io/npm/dm/msnodesqlv8.svg)](https://github.com/TimelordUK/node-sqlserver-v8)
[![npm](https://img.shields.io/npm/dy/msnodesqlv8.svg)](https://github.com/TimelordUK/node-sqlserver-v8)

1. *new* support always on encryption via tables and procedures.
1. *new* support Node v19
1. *new* support electron v22
1. *new* read numerics as strings - see WIKI
1. *new* Sybase Adaptive Server Enterprise support - see WIKI
1. *new* thread worker support - see WIKI
1. *new* manually register tables
1. *new* manually register and execute stored proc
1. *new* promises - see WIKI
1. *new* fast BCP bulk insert - see WIKI
1. *new* 64 bit x64 Linux
1. *new* includes MacOS support
1. *new* use object based named params for proc calls - see WIKI
1. *new* improved local date support via bound tables

1. pause/resume long running query
1. built in connection pool
1. sequelize support directly included
1. supports input/output parameters.
1. captures return code from stored procedure.
1. will obtain meta data describing parameters.
1. compatible with Node versions greater 12.0
1. electron version greater than 5.0
1. includes 64 bit/ia32 precompiled libraries.
1. npm install with npm install msnodesqlv8
1. bulk table operations insert, delete, update
1. prepared statements
1. table value parameters
1. native sequelize support

## Node JS support for SQL server (and other databases with ODBC compliant driver)

This library has full compatibility with MS SQL Server using an MS ODBC driver. Many functions e.g. open, query, connection pool, prepare, transactions, close will work with any ODBC compatible driver with its repsective database.

Based on node-sqlserver, this version will compile in Visual Studio 2017/2019 and is built against the v8 node module API using the NAN abstraction.
Releases include pre-compiled binaries for both x64 and x86 targets for Node and Electron.

This library only works with Node versions greater than 10.0 or electron greater than 5.0

## BCP (odbc v17 / v18 only)

BCP allows fast insert speed from client to a designated table.  This is achieved via allocating fixed positions in memory binding each column on that table and re-populating/sending each row to the server. It is in effect a memory copy from the client to the table.  

a 16 column Employee table mixed with binary, varchar, date, int and decimal can insert over 50k rows in 3 seconds (vs 25 seconds using non bcp) over a network, smaller tables speeds can be over 100k a second.

```js
    // see bcp.js unit tests - bind to a table
    async create () {
      const promisedQuery = util.promisify(theConnection.query)
      const tm = theConnection.tableMgr()
      const promisedGetTable = util.promisify(tm.getTable)
      await promisedQuery(this.dropTableSql)
      await promisedQuery(this.createTableSql)
      const table = await promisedGetTable(this.tableName)
      return table
    }
  }
 // set the flag to turn on bcp and send rows to server using fast memory copy.
 theConnection.setUseUTC(false)
        const table = await helper.create()
        table.setUseBcp(true)
        const promisedInsert = util.promisify(table.insertRows)
        const promisedQuery = util.promisify(theConnection.query)
```

This protocol is not part of the ODBC specification and its use therefore depends on using correct ODBC driver.  For linux users, this should work out the box as ODBC 17, 18 are the only drivers supported. The feature has been tested on Ubuntu, MacOS, Debian and Alpine.

For windows users, older drivers can still be used on all non bcp functions just as before - however presently only ODBC 17 and 18 are supported for bcp. Hence you need to have installed ODBC data source "ODBC Driver 17 for SQL Server" or "ODBC Driver 18 for SQL Server".  No other driver will work and attempts to do so will probably crash the node instance.

see wiki for more details or bcp unit tests - bcp is accessed via the table manager i.e. binding to a table and enabling bcp on that table returned.

## Linux (x64 only)

if running on Linux, the odbc driver needs to be installed as outlined here [ODBC 17](https://docs.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server?view=sql-server-ver15). Please use version >= 17.5 which has been tested with this library.  We are running test suite for Linux on AppVeyor which you can see via the badge at top of this page. Linux distros tested so far are Ubuntu 18.04, Alpine 3.12, Ubuntu 20.04, Debian 10.5, MacOS (see [wiki](https://github.com/TimelordUK/node-sqlserver-v8/wiki)) and Fedora 32.  The driver also works under windows linux subsystem 2 (WLS).

## Installing

Install the package from npm:

```cmd
npm install msnodesqlv8 --save
```

## Getting started

please see [wiki](https://github.com/TimelordUK/node-sqlserver-v8/wiki) for documentation.

### JavaScript

Require the module, and write a simple program link this:

```javascript
const sql = require("msnodesqlv8");

const connectionString = "server=.;Database=Master;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0}";
const query = "SELECT name FROM sys.databases";

sql.query(connectionString, query, (err, rows) => {
    console.log(rows);
});
```

See our [JavaScript sample app](samples/javascript) for more details.

### TypeScript

Typings are included in the package. Simply import the types you need, and require the module to get started:

```typescript
import { SqlClient } from "msnodesqlv8";

const sql: SqlClient = require("msnodesqlv8");

const connectionString = "server=.;Database=Master;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0}";
const query = "SELECT name FROM sys.databases";

sql.query(connectionString, query, (err, rows) => {
    console.log(rows);
});
```

See our [TypeScript sample app](samples/typescript) for more details.

### Electron

Since this is a native module, you will likely need to run [electron-rebuild](https://github.com/electron/electron-rebuild) to rebuild the module for your version of Electron.

Please see [wiki](https://github.com/TimelordUK/node-sqlserver-v8/wiki) for getting started with electron boilerplate with React.

### Webpack

If you are using Webpack for your application, you need to:

1. Add the [node-loader](https://webpack.js.org/loaders/node-loader/) as a dev dependency.
2. Update your `webpack.config.js` to include the following under `module.rules`:

```cmd
    {
        test: /\.node$/,
        use: 'node-loader'
    }
```

### Pool

you can now submit queries through a native library connection pool.  This pool creates a set of connections and queues work submitting items such that all connections are busy providing work exists.  A keep alive is sent periodically to check connection integrity and idle connections beyond a threshold are closed and re-created when queries submitted at a later point in time. Queries can be cancelled and paused / resumed regardless of where they are in the work lifecycle

examples can be seen [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/unit.tests/connection-pool.js) and [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/samples/javascript/pooling.js)

```javascript

export interface PoolOptions {
    floor: number
    ceiling: number
    heartbeatSecs: number
    heartbeatSql: string
    inactivityTimeoutSecs: number
    connectionString: string
}

const pool = new sql.Pool(options)
```

the following example shows the pool being used.

```javascript
const sql = require('msnodesqlv8')

const pool = new sql.Pool({
  connectionString: 'Driver={ODBC Driver 13 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'
})

pool.on('open', (options) => {
  console.log(`ready options = ${JSON.stringify(options, null, 4)}`)
})

pool.on('debug', msg => {
  console.log(`\t\t\t\t\t\t${new Date().toLocaleTimeString()} <pool.debug> ${msg}`)
})

pool.on('status', s => {
  console.log(`status = ${JSON.stringify(s, null, 4)}`)
})

pool.on('error', e => {
  console.log(e)
})

const testSql = 'waitfor delay \'00:00:10\';'

function submit (sql) {
  const q = pool.query(sql)
  console.log(`send ${new Date().toLocaleTimeString()}, sql = ${sql}`)
  q.on('submitted', d => {
    console.log(`query submitted ${new Date().toLocaleTimeString()}, sql = ${d.query_str}`)
    q.on('done', () => console.log(`query done ${new Date().toLocaleTimeString()}`))
  })
  return q
}

for (let i = 0; i < 7; ++i) {
  const q = submit(testSql)
  switch (i) {
    case 5:
      console.log('cancel a query')
      q.cancelQuery()
      break
    case 6:
      q.pauseQuery()
      setTimeout(() => {
        console.log('resume a paused query')
        q.resumeQuery()
      }, 50000)
      break
    default:
      break
  }
}

setInterval(() => {
  submit(testSql)
}, 60000)

pool.open()

```

## Prepared Statements

It is now possible to prepare one or more statements which can then be invoked
over and over with different parameters.  There are a few examples in the prepared unit tests.
Please note that prepared statements must be closed as shown below when they are no longer required.
Each prepared statement utilises server resources so the application should open and close appropriately.

Prepared Statements can be useful when there is a requirement to run the same SQL with different
parameters many times.  This saves overhead from constantly submitting the same SQL to the server.

```javascript
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
```

## Connect Timeout

send in a connect object to pass a timeout to the driver for connect request

```javascript
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

```

## Query Timeout

send in a query object such as that shown below to set a timeout for a particular query.  Note usual semantics of using a sql string parameter will result in no timeout being set

```javascript
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


```

A timeout can also be used with a stored procedure call as follows :-

```javascript
        function go() {
            var pm = c.procedureMgr();
            pm.setTimeout(2);
            pm.callproc(sp_name, ['0:0:5'], function(err, results, output) {
                assert(err != null);
                assert(err.message.indexOf('Query timeout expired') > 0)
                test_done();
            });
        }
```

## User Binding Of Parameters

In many cases letting the driver decide on the parameter type is sufficient.  There are occasions however where more control is required. The API now includes some methods which explicitly set the type alongside the value.  The driver will in this case
use the type as provided.  For example, to set column type as binary and pass in null value, use the sql.VarBinary as shown below.  There are more examples in test harness file userbind.js.

```javascript
     sql.open(connStr, function(err, conn) {
         conn.query("declare @bin binary(4) = ?; select @bin as bin", [sql.VarBinary(null)], function (err, res) {
             var expected = [ {
                 'bin' : null
             }];
             assert.ifError(err);
             assert.deepEqual(expected, res);
         });
     });
```

## Stored Procedure Support

Included in this module is support for stored procedures in SQL server.  Simple input/output parameters and return value can be bound.  

open a connection, and get an instance of procedureMgr

```javascript
        sql.open(conn_str, function (err, conn) {
                var pm = conn.procedureMgr();
                pm.callproc('my_proc', [10], function(err, results, output) {
            });
        });
```

in above example a call is issued to the stored procedure my_proc which takes one input integer parameter.  results will contain rows selected within the procedure and output parameters are inserted into output vector.  Note the [0] element in output will be the return result of the procedure.  If no return exists in the procedure, this value will be 0.  Any further elements in the array will be output parameters populated by the execution of the procedure.

Note the manager will issue a select to the database to obtain meta data about the procedure.  This is cached by the manager.  It is possible to obtain this information for inspection.

```javascript
    pm.describe(name, function (meta) {
        console.log(JSON.stringify(meta));
        pm.callproc('my_proc', [10], function (err, results, output) {
        });
    });
```

meta will contain the parameter array associated with the procedure, the type, size and call signature required.  

the test folder includes some simple unit tests for stored procedures.  If you discover any problems with using this new feature please include a simple example, preferably a unit test illustrating the issue.  I will endeavour to fix the issue promptly.

Further enhancements will be made to the library over the coming months - please leave feedback or suggestions for required features.

## Bulk Table Operations

Bulk insert/delete/modify is now supported through a helper class.  The underlying c++ driver will reserve vectors containing the column data and submit in bulk to the database which will reduce network overhead.  It is possible to configure in the java script a batch size which will break the master vector of objects down into batches each of which is prepared and sent by the driver. Most of the effort for this update was spent in getting the c++ driver to work, the js API still needs a little refinement, so please use the feature and make suggestions for improvements.

If issues are found, please provide the exact table definition being used and ideally a unit test illustrating the problem.

take a look at the unit test file bulk.js to get an idea of how to use these new functions.

once a connection is opened, first get the table manager :-

```javascript
            var tm = c.tableMgr();
            tm.bind('Employee', cb);
```

the table manager will fetch some meta data describing the table 'Employee' and make a callback providing a manager for that particular table :-

```javascript
            function cb(bulkMgr) {
              // bulkMgr is now ready to accept bulk operations for table 'Employee'
              // see employee.json and employee.sql in test.
              var parsedJSON = getJSON(); // see bulk.js
              bulkMgr.insertRows(parsedJSON, insertDone);
            }
```

you can look at the signatures, columns and other interesting information by asking for a summary :-

```javascript
             var summary = bulkMgr.getSummary();
```

by default the primary key of the table is assigned to the where condition for select which gives a convenient way of selecting a set of rows based on knowing the keys.  Note this operation is not yet optimized with bulk fetch, which will be enhanced in the next update addressing cursors.

```javascript
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
```

it is possible to change the where clause by using a different column signature - for example, LoginID

```javascript
            var whereCols = [];
            whereCols.push({
                name : 'LoginID'
            });
            // as above keys now needs to contain a vector of LoginID
            bulkMgr.setWhereCols(whereCols);
            bulkMgr.selectRows(keys, bulkDone);
 ```

Amends can be made to a sub set of columns, for example to bulk update the modified date, prepare a set of objects with the primary keys to satisfy the where clause and of course the column to be updated. By default all assignable columns are used for the update signature so the entire object would need to be presented.  Where performance is within acceptable limits, this is probably the easiest pattern i.e. select the entire object, amend as required and commit the amended vector back to the database.

```javascript
                var newDate = new Date("2015-01-01T00:00:00.000Z");
                var modifications = [];
                parsedJSON.forEach(function(emp) {
                    emp.ModifiedDate = newDate;
                    modifications.push( {
                        BusinessEntityID : emp.BusinessEntityID,
                        ModifiedDate : newDate
                    });
                });
```

tell the bulkMgr which columns to use for the update and send in the modification :-

```javascript
                var updateCols = [];
                updateCols.push({
                    name : 'ModifiedDate'
                });

                bulkMgr.setUpdateCols(updateCols);
                bulkMgr.updateRows(modifications, updateDone);
```

the manager can also delete rows - the where clause is used in binding signature so by default this will be the primary key.  Similar to the select examples above :-

```javascript
                 bulkMgr.deleteRows(keys, function (err, res) {
                 })
```

of course keys can be the original objects as fetched with select - the driver only needs all columns that satisfy the where condition of the signature.

finally, to reset the signatures the summary can help :-

```javascript
                 var summary = bulkMgr.getSummary();
                 bulkMgr.setWhereCols(summary.primaryColumns);
                 bulkMgr.setUpdateCols(summary.assignableColumns);
```

Further enhancements will be made to the library over the coming months - please leave feedback or suggestions for required features.

## Use with Sequelize

This library now has direct support for sequelize v6, the popular ORM:

```js
const Sequelize = require('sequelize')

const sequelize = new Sequelize({
  dialect: 'mssql',
  dialectModulePath: 'msnodesqlv8/lib/sequelize',
  dialectOptions: {
    user: '',
    password: '',
    database: 'node',
    options: {
      driver: '',
      connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;',
      trustedConnection: true,
      instanceName: ''
    }
  },
  pool: {
    min: 0,
    max: 5,
    idle: 10000
  }
})
```

## Building

Pre-compiled binaries are provided for each release. If you are running a version of Node or Electron that a pre-compiled binary has not been provided for,
you can build your own module using [node-gyp](https://github.com/nodejs/node-gyp).

```cmd
cd node_modules\msnodesqlv8
node-gyp
```

## Test

Included are a few unit tests.  They require mocha, async, and assert to be
installed via `npm install`.

The unit test suite uses the SQLLocalDB utility provided by [SQL Server Express](https://docs.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-express-localdb).

To run the tests:

1. Install [SQL Server Express](https://docs.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-express-localdb) with the LocalDB option (it is not included in the default installation).
1. From the command-line, run the following commands to create a SQL Server instance called "node":

```shell
sqllocaldb create node
sqllocaldb start node
sqllocaldb info node
```

1. Copy the "Instance pipe name" value from the output of `sqllocaldb info node`. The format will be like `np:\\.\pipe\LOCALDB#<hash>\tsql\query`.
1. Open [SQL Server Management Studio](https://docs.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms).
1. In the "Connect to Server" dialog, paste the "Instance pipe name" you copied above and connect using "Windows Authentication".
1. Create a new database, called `scratch`.

You will now be able to run the tests using the following command:

```cmd
npm run test
```

You must ensure the `node` SQLLocalDB instance is running before running the test command.

Note if you wish to run the code through an IDE such as PHPStorm, the following fragment may help :-

```javascript
    function runTest() {

    var mocha = new Mocha(
        {
            ui : 'tdd'
        });

    -- change path as required to unit test file, set breakpoint and run via IDE

    mocha.addFile('node_modules/node-sqlserver-v8/test/query.js');

    mocha.run(function (failures) {
        process.on('exit', function () {
            process.exit(failures);
        });
    });
```

## Known Issues
