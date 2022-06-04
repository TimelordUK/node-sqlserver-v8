# NODE-SQLSERVER-V8 #

[![Build status](https://ci.appveyor.com/api/projects/status/7swf644d37pqdmuj/branch/master?svg=true)](https://ci.appveyor.com/project/TimelordUK/node-sqlserver-v8/branch/master) [![npm version](https://badge.fury.io/js/msnodesqlv8.svg)](https://badge.fury.io/js/msnodesqlv8)
[![GitHub stars](https://img.shields.io/github/stars/TimelordUK/node-sqlserver-v8.svg)](https://github.com/TimelordUK/node-sqlserver-v8/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/TimelordUK/node-sqlserver-v8.svg)](https://github.com/TimelordUK/node-sqlserver-v8/issues)
[![npm](https://img.shields.io/npm/dm/msnodesqlv8.svg)]
[![npm](https://img.shields.io/npm/dy/msnodesqlv8.svg)]

1. [What is this library for?](#what-is-library-for)
1. [What Platforms does it support?](#supported-platforms)
1. [Running on macOS (darwin)](#darwin)
1. [Sequelize Compatibility?](#sequelize-compatibility)
1. [Is the library production quality?](#production-quality)
1. [How to install](#install)
1. [Does this library support electron?](#electron-support)
1. [electron troubleshoot](#electron-trouble-shoot)
1. [How do I set the app name on connection string?](#set-app-name)
1. [How does the driver handle SQL_VARIANT types](#handling-variant)
1. [Errors when passing strings > 2k in length.](#long-strings)
1. [Api](#api)
1. [Read BigInt numbers as JS strings](#bigint-strings)
1. [Sybase Adaptive Server](#sybase-adaptive-server)
1. [thread pooling](#thread-pooling)
1. [promises](#promises)
1. [Table Value Parameters TVP](#table-value-parameters)
1. [User Binding](#user-binding)
1. [Async Patterns](#async-patterns)
1. [Connecting](#connecting)
1. [ConnectionPool](#pool)
1. [Executing A Query](#executing-a-query)
1. [Geography Types](#geography)
1. [Pause A Query](#pause-a-query)
1. [Cancel A Query](#cancel-a-query)
1. [Subscribing To Driver Events](#subscribing-to-driver-events)
1. [Capturing Print Output](#capture-print)
1. [Register Stored Procedure](#register-stored-procedure)
1. [Executing Stored Procedures](#executing-stored-procedures)
1. [Table Binding](#table-binding)
1. [BCP](#bcp)
1. [Prepared Statements](#prepared-statements)
1. [Easiest Way To See Library Being Used](#easiest-way-to-see-library-being-used)
1. [Testing The Driver](#testing-the-driver)
1. [Compiling The Driver](#compiling-the-driver)
1. <a href="#setup">Setup a development environment</a>

## What Is Library For ##

This wiki describes [NodeJS](https://nodejs.org) npm module [msnodesqlv8](https://www.npmjs.com/package/msnodesqlv8).  It has been forked from the Microsoft SQL server ODBC module msnodesql and has been reworked to be compatible with later versions of Node.   New features are being introduced.

This npm module will allow a windows instance of Node JS to connect to a SQL server database and submit SQL queries via a javascript api.

The module is a mixture of C++ and javascript.  Compiled binaries are supplied, therefore it should be up and running quickly for use against your database.   Those familiar with the Microsoft original library will feel at home as the api is a super-set of existing functionality.

Please give the module a try and feel free to offer suggestions for improvement.

## Supported Platforms ##

[msnodesqlv8](https://www.npmjs.com/package/msnodesqlv8) will run on 32 bit and 64 bit versions of Node JS hosted on the Windows operating system.  All major versions of Node are supported and tested i.e. >= 10 [download node here](https://nodejs.org/en/download/).  [previous node releases](https://nodejs.org/en/download/releases/).

if running on Linux, the odbc driver needs to be installed as outlined here [ODBC 17](https://docs.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server?view=sql-server-ver15). Please use version >= 17.5 which has been tested with this library.  We are running test suite for Linux on AppVeyor which you can see via the badge at top of this page. Linux distros tested so far are Ubuntu 18.04, Alpine 3.12, Ubuntu 20.04, Debian 10.5 and Fedora 32.  The driver also works under windows linux subsystem 2 (WLS).

## debian crash - ssl stack trace ##

if the library crashes with segmentation fault it is likely related to version of ssl

if you have access to brew

```bash
brew install openssl
cd /usr/lib
sudo ln -s /home/linuxbrew/.linuxbrew/opt/openssl@3/lib/libssl.so libssl.so.1.1
export LD_PRELOAD=/usr/lib/libssl.so.1.1

me@me-pc:~/dev/js/published/samples/javascript$ export LD_PRELOAD=/usr/lib/libssl.so.1.1
me@me-pc:~/dev/js/published/samples/javascript$ ps -ef | grep node
me   6350  1576 54 15:57 pts/0    00:00:39 node pooling.js
me   6634  6370  0 15:58 pts/1    00:00:00 grep node
me@me-pc:~/dev/js/published/samples/javascript$ pldd 6350
6350:	/home/me/.nvm/versions/node/v16.13.0/bin/node
linux-vdso.so.1
/usr/lib/libssl.so.1.1
/lib/x86_64-linux-gnu/libdl.so.2
/lib/x86_64-linux-gnu/libstdc++.so.6
/lib/x86_64-linux-gnu/libm.so.6
/lib/x86_64-linux-gnu/libgcc_s.so.1
/lib/x86_64-linux-gnu/libpthread.so.0
/lib/x86_64-linux-gnu/libc.so.6
/lib64/ld-linux-x86-64.so.2
/home/linuxbrew/.linuxbrew/Cellar/openssl@1.1/1.1.1l_1/lib/libcrypto.so.1.1
/home/me/dev/js/published/node_modules/msnodesqlv8/build/Release/sqlserverv8.node
/lib/x86_64-linux-gnu/libodbc.so.2
/usr/lib/x86_64-linux-gnu/gconv/UTF-16.so
/opt/microsoft/msodbcsql17/lib64/libmsodbcsql-17.8.so.1.1
/lib/x86_64-linux-gnu/librt.so.1
/lib/x86_64-linux-gnu/libodbcinst.so.2
/lib/x86_64-linux-gnu/libkrb5.so.3
/lib/x86_64-linux-gnu/libgssapi_krb5.so.2
/lib/x86_64-linux-gnu/libk5crypto.so.3
/lib/x86_64-linux-gnu/libcom_err.so.2
/lib/x86_64-linux-gnu/libkrb5support.so.0
/lib/x86_64-linux-gnu/libkeyutils.so.1
/lib/x86_64-linux-gnu/libresolv.so.2
/lib/x86_64-linux-gnu/libnss_files.so.2
me@me-pc:~/dev/js/published/samples/javascript$ 

me@me-pc:~/dev/js/published/samples/javascript$ uname -a
Linux me-pc 4.19.0-18-amd64 #1 SMP Debian 4.19.208-1 (2021-09-29) x86_64 GNU/Linux
me@me-pc:~/dev/js/published/samples/javascript$ node simple-demo.js 
rows.length 36 elapsed 48
rows.length 36 elapsed 30
me@me-pc:~/dev/js/published/samples/javascript$ 

```

## darwin ##

Note the driver has been tested on macOS High Sierra.  MacOS native binaries are now supplied and should be available via NPM

You need to install Xcode before running those steps
It is highly recommended to install nvm if not already present - launch a terminal

```bash
touch ~/.bash_profile # you need a profile even an empty one
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash
# profile should contain
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# restart terminal .... check nvm is installed
nvm --version
# install latest node e.g.
nvm install 15.5.0
# check node is installed
node --version
```

install g++ if not already present - below will invite you to install if not yet present.

```bash
g++ --version
```

Install Microsoft ODBC driver via HomeBrew

```bash
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
brew update
# build odbc driver
HOMEBREW_NO_ENV_FILTERING=1 ACCEPT_EULA=Y brew install msodbcsql17 mssql-tools
```

fetch the node driver

```bash
# assume folder such as dev/js/sql/node_modules
git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8
cd msnodesqlv8/
node-gyp rebuild
npm install
```

run a sample

```bash
cd samples/javascript
# edit the jaon file and set a valid connection - change local or add a new one and edit code
node throttle
```

```txt
stream fetch query with throttle back to server to slow results
on.submitted select top 750 * from master..syscolumns;
22:31:37 - [0] (rowCount 100): pause and dispatch 100 rows ...
22:31:37 - [0] (rowCount 100): ... done, resume query
22:31:39 - [1] (rowCount 200): pause and dispatch 100 rows ...
22:31:39 - [1] (rowCount 200): ... done, resume query
22:31:40 - [2] (rowCount 300): pause and dispatch 100 rows ...
22:31:40 - [2] (rowCount 300): ... done, resume query
22:31:42 - [3] (rowCount 400): pause and dispatch 100 rows ...
22:31:42 - [3] (rowCount 400): ... done, resume query
22:31:43 - [4] (rowCount 500): pause and dispatch 100 rows ...
22:31:43 - [4] (rowCount 500): ... done, resume query
22:31:45 - [5] (rowCount 600): pause and dispatch 100 rows ...
22:31:45 - [5] (rowCount 600): ... done, resume query
22:31:47 - [6] (rowCount 700): pause and dispatch 100 rows ...
22:31:47 - [6] (rowCount 700): ... done, resume query
on.done
[7] (rowCount 750): last dispatch 50 rows
done
```

## Sequelize Compatibility ##

the library now has direct support for [sequelize](https://www.npmjs.com/package/sequelize), the popular JS ORM. Simply configure sequelize to point to dialectModulePath directly under msnodesqlv8/lib/sequelize

[example](https://github.com/TimelordUK/node-sqlserver-v8/tree/master/samples/javascript/sequelize.js)

```js
const Sequelize = require('sequelize')

let sequelize = new Sequelize({
  dialect: 'mssql',
  dialectModulePath: 'msnodesqlv8/lib/sequelize',
  dialectOptions: {
    'user': '',
    'password': '',
    'database': 'scratch',
    'connectionString': 'Driver={SQL Server Native Client 11.0};Server= np:\\\\.\\pipe\\LOCALDB#2DD5ECA9\\tsql\\query;Database=scratch;Trusted_Connection=yes;',
    'options': {
      'driver': 'SQL Server Native Client 11.0',
      'trustedConnection': true,
      'instanceName': ''
    }
  },
  pool: {
    min: 0,
    max: 5,
    idle: 10000
  }
})

function createUserModel () {
  return sequelize.define('user', {
    username: {
      type: Sequelize.STRING
    },
    job: {
      type: Sequelize.STRING
    }
  })
}

function userModel () {
  return new Promise(async (resolve, reject) => {
    let user = createUserModel()
    // force: true will drop the table if it already exists
    await user.sync({ force: true })
    await Promise.all([
      user.create({
        username: 'techno01',
        job: 'Programmer'
      }),
      user.create({
        username: 'techno02',
        job: 'Head Programmer'
      }),
      user.create({
        username: 'techno03',
        job: 'Agile Leader'
      })
    ]).catch((e) => reject(e))

    let id1 = await user.findByPk(3)
    console.log(JSON.stringify(id1, null, 4))

    let agile = await user.findOne({
      where: { job: 'Agile Leader' }
    })
    console.log(JSON.stringify(agile, null, 4))

    let all = await user.findAll()
    console.log(JSON.stringify(all, null, 4))

    let programmers = await user
      .findAndCountAll({
        where: {
          job: {
            [Sequelize.Op.like]: '%Programmer'
          }
        },
        limit: 2
      })
    console.log(programmers.count)
    const dataValues = programmers.rows.reduce((aggregate, latest) => {
      aggregate.push(latest.dataValues)
      return aggregate
    }, [])
    console.log(dataValues)

    resolve()
  })
}

userModel().then(() => {
  sequelize.close()
  console.log('done')
})

```

## Production Quality ##

The library is subjected to extensive testing in continuous test cycles to ensure stability and accuracy.  It is being used in production environments.

## install ##

ensure you have an up to date version of node installed on your computer first :-

``` javascript
    npm install msnodesqlv8
```

to use the code in your node javascript having installed :-

``` javascript
    var sql = require('msnodesqlv8');
```

## Electron Support ##

Yes.  [Electron](http://electron.atom.io/) is a framework for creating native applications with web technologies.  This library now ships with compiled binaries that are compatible with Electron.

## Electron Trouble shoot ##

some information in this thread may be of use in trying to complile against electron

[electron-issue](https://github.com/TimelordUK/node-sqlserver-v8/issues/80)

``` json
"scripts": {
    "copybinding": "copy .\\node_modules\\msnodesqlv8\\bindingdotgyp.old .\\node_modules\\msnodesqlv8\\binding.gyp",
    "rebuild": "cd .\\node_modules\\.bin\\ && electron-rebuild -f -w msnodesqlv8 --module-dir ..\\..\\",
    "movenode": "move .\\node_modules\\msnodesqlv8\\bin\\win32-x64-69\\msnodesqlv8.node .\\node_modules\\msnodesqlv8\\lib\\bin\\msnodesqlv8.node",
    "postinstall": "npm run copybinding && npm run rebuild && npm run movenode",
    ...
},
```

here is a good starting point for React running in Electron using the superb [boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate) which works particularly well using visual studio code.

```cmd
git clone --depth 1 --single-branch https://github.com/electron-react-boilerplate/electron-react-boilerplate.git erb-msnodesqlv8
cd .\erb-msnodesqlv8\
yarn
cd .\app\
yarn
yarn add --dev electron-rebuild
yarn add msnodesqlv8
.\node_modules\.bin\electron-rebuild.cmd
cd ..
yarn dev
```

for example replace app\components\Home.tsx with following to show module running in the renderer.  This has been tested on both Windows and Linux. In the sample look at the console output to see list of databases selected assuming a valid connection string.

```ts
import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import { SqlClient } from 'msnodesqlv8';
import styles from './Home.css';

export default function Home(): JSX.Element {
  const sql: SqlClient = require('msnodesqlv8');

  const connectionString =
    'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node; Database={master}; Trusted_Connection=Yes;';
  const query = 'SELECT name FROM sys.databases';

  sql.query(connectionString, query, (err, rows) => {
    console.log(rows);
  });

  return (
    <div className={styles.container} data-tid="container">
      <h2>Home</h2>
      <Link to={routes.COUNTER}>to Counter</Link>
    </div>
  );
}
```

## Set App Name ##

Use the 'APP=my-application' such as in the example below. [issue](https://github.com/TimelordUK/node-sqlserver-v8/issues/25)

```sql

Driver={SQL Server Native Client 11.0}; APP=msnodesqlv8; Server=np:\.\pipe\LOCALDB#8704E301\tsql\query; Database={scratch}; Trusted_Connection=Yes

```

## Handling Variant ##

```typescript

    c.query("select cast(10000 as sql_variant) as data;",  (err, res) => {});
```

the driver on detecting variant type will query underlying type information and proceed to interpret column as that underlying type.  In the example above the column therefore will be presented as javascript int type.

## Long Strings ##

from 0.6 this is not necessary, the driver will automatically choose correct binding.

see [issue](https://github.com/TimelordUK/node-sqlserver-v8/issues/24)

use one of the user binding functions which will force the driver to use the specified binding type rather than guessing from the input data.  In this case WLongVarChar should resolve the issue of binding large strings.

``` typescript

function largeText() {
    var len = 2200;
    var s = "A".repeat(len);
    sql.open(connStr, (err, conn) => {
        conn.query("declare @s NVARCHAR(MAX) = ?; select @s as s", [sql.WLongVarChar(s)],
        (err, res) => {
            assert.ifError(err);
            var ss = res[0].s;
            assert(ss.length == len);
        });
    });
}

```

## Api ##

### typescript type based information for this library.  [api](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/lib/MsNodeSqlDriverApiModule.ts) ###

```javascript

import {MsNodeSqlDriverApiModule as v8} from './lib/MsNodeSqlDriverApiModule'

import v8Connection = v8.v8Connection;
import v8PreparedStatement = v8.v8PreparedStatement;
import v8BindCb = v8.v8BindCb;
import v8BulkMgr = v8.v8BulkTableMgr;
import v8Error = v8.v8Error;

export const sql: v8.v8driver = require('msnodesqlv8');

```

#### including library for use in node ####

```javascript

var sql = require('msnodesqlv8');
export const sql: v8.v8driver = require('msnodesqlv8'); // typescript

```

#### open a connection with standard connection string ####

```typescript

sql.open(conn_str, function (err, conn) { });

```

#### open a connection with timeout ####

```typescript

sql.open( {conn_str : '', conn_timeout : 10}, function (err, conn) {});

```

#### close an open connection ####

```typescript

conn.close(function () { });

```

#### query, error and the more flag ####

When executing a query, the more flag may be used to indicate no further results will be returned. This optional paramater will be set true for example when queries of form 'select ....; select .....' are issued.

It is worth noting behaviour when a query such as below is executed.

```sql

    let severity = 9; // or 14 for immediate terminate
    RAISERROR(`'User JS Error', ${severity}, 1);SELECT 1+1;`;

```

here the first statement to run will be RAISEERROR.  When submitting severity code less than 14, the driver has an oppertunity to read the error code and proceed to returning results on the follwing query.  In this case the more flag will be set true and the error condition set.  A further callback can be expected with the results and err code not set.

When error code is >= 14 the driver immediately terminates as odbc will not allow results to be obtained from further queries. In this case the more flag will be false and the err condition set to the RAISEERROR.

This behaviour is demonstrated in following test code which loops forever executing this example to prove the connection will recover from a termination of this kind.

```cmd

tool\t-busy14.bat
node test\edge-case.js -t busy --delay=500 --severity=14

tool\t-busy9.bat
node test\edge-case.js -t busy --delay=500 --severity=9

```

#### query an opened connection no input parameters ####

```typescript

var q = conn.query(sql, function (err, results, more) { });

```

#### call a stored proc direct from connection ####

```typescript

// call a proc - omit callback and listen to events
const q = conn.callproc (name, paramsOrCb, function (err, results, output, more) { })) 

// helper promise to accumulate results, info messages, output variables
const q = await conn.callprocAggregator(procName, o, options)

```

#### query an opened connection with input parameters ####

```typescript

var q = conn.query(sql, [], function (err, results, more) { });

```

#### adhoc query i.e. open, query, close, callback ####

```typescript

sql.query(conn_str, q, [], function (err, results, more) { });

```

#### query an opened connection with timeout ####

```typescript

conn.query({query_str: '',query_timeout: 10},  (err, results, more) => {});

```

#### prepare a reusable statement on an open connection ####

```typescript

conn.prepare(select, function (err, ps) { });

```

#### execute using prepared statement and input vector of parameters ####

```typescript

ps.preparedQuery([], function (err, res) { });

```

#### free a prepared statement when no longer required ####

```typescript

ps.free(function () { });

```

#### listening to query events ####

```typescript

q.on('error', function(err) { }); // Error type i.e. e.message
q.on('meta', function(meta) { }); // array of column meta data relating to query.
q.on('column', function(col, v) { }); // value relating to column for current row
q.on('info', function(e) { }); // Error type i.e. e.message
q.on('rowcount', function(count) { });
q.on('row', function(row) { }); // the start of index row
q.on('done', function() { }); // no more results - statement still natively exists
q.on('submitted', function() { }); // statement has been sent to native driver.
q.on('output', function() { }); // stored proc call unbinds output params
q.on('open', function() { }); // new connection is open
q.on('closed', function() { });
q.on('free', function() { }); // when native driver releases resources on statement

 ```

#### obtain procedure manager ####

```typescript

var pm = conn.procedureMgr();

```

#### invoke a stored procedure with input params ####

```typescript

pm.callproc(sp_name, [], function(err, results, output) { });

```

#### obtain table manager ####

```typescript

var tm = conn.tableMgr();

```

#### bind the manager to a target table ####

```typescript

tm.bind(table_name, function (bm) {});

```

#### drive types sent to driver from column definitions - not derived from data ####

```typescript

bm.useMetaType(true)

```

#### use local timestamps not adjusted to UTC ####

``` javascript
  test('use tableMgr bulk insert single non UTC based date with datetime col', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'datetime')
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = helper.getVec(1, () => testDate)
      theConnection.setUseUTC(false)
      const table = await helper.create()
      const promisedInsert = util.promisify(table.insertRows)
      const promisedSelect = util.promisify(table.selectRows)
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.col_a.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })
```

#### insert using bulk manager with array of objects ####

```typescript

bm.insertRows([], function () {});

```

#### select with array of designated keys ####

```typescript

bm.selectRows([], function (err, res) {});

```

#### delete rows with array of designated keys ####

```typescript

bm.deleteRows([], function () {});

```

#### modify rows via designated keys ####

```typescript

bm.updateRows([], function () {});

```

#### change the set of update columns to be modified via updateRows ####

```typescript

bm.setUpdateCols(updateCols);

```

#### return a summary object representing the bound table ###

```typescript

res = bm.getSummary();

```

## Table Value Parameters ##

From version 0.4.1 the library node supports Table Value Parameters

please refer to [tvp.js](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/unit.tests/tvp.js) for examples

assuming a type is created in the database

```sql

CREATE TYPE TestTvpType AS TABLE (username nvarchar(30), age int, salary real)

```

use a connection object to get a Table representing this type.

```javascript

     function (asyncDone) {
        theConnection.getUserTypeTable(tableTypeName, function (err, t) {
          assert.ifError(err)
          table = t
          assert(table.columns.length === 3)
          asyncDone()
        })
      }

```

add some rows to the table.

``` javascript

  var vec = [
    {
      username:'santa',
      age:1000,
      salary:0
    },
    {
      username:'md',
      age:28,
      salary:100000
    }
  ]

    function (asyncDone) {
          // see above
        table.addRowsFromObjects(vec)
        asyncDone()
    }

```

create a table parameter from the Table. This method can also accept an mssql Table type.

```javascript

    var tp = sql.TvpFromTable(table)

```

create a table in the datbase representing the type.

```sql

create TABLE TestTvp (
    username nvarchar(30),
    age int,
    salary real
)

```

add a stored procedure to insert to the table from the new type

```sql

create PROCEDURE InsertTestTvp
@tvp TestTvpType READONLY
AS
BEGIN
 set nocount on
 INSERT INTO TestTvp
 (
   [username],
   [age],
   [salary]
 )
 SELECT
    [username],
    [age],
    [salary]
n FROM @tvp tvp
END

```

invoke the stored procedure to insert records.

```javascript

      function (asyncDone) {
        // see above to create a table
        var tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('exec insertTestTvp @tvp = ?;', [tp], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query('select * from ' + tableName, function (err, res) {
          assert.ifError(err)
          assert.deepEqual(vec, res)
          asyncDone()
        })
      }

```

if an existing table exists. i.e. Employee - bind to it using tablem manager

```javascript

      function (asyncDone) {
        var tableName = 'Employee'
        var tm = theConnection.tableMgr()
        tm.bind(tableName, function (bulk) {
          bulkMgr = bulk
          asyncDone()
        })
      }

```

then can get a sql representation of the table

``` javascript

      function (asyncDone) {
        var sql = bulkMgr.asUserType()
        theConnection.query(sql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      }

```

which is represented as below

```sql

CREATE TYPE EmployeeType AS TABLE (BusinessEntityID int, NationalIDNumber nvarchar(15), LoginID nvarchar(256), OrganizationNode hierarchyid, OrganizationLevel smallint, JobTitle nvarchar(50), BirthDate date, MaritalStatus nchar, Gender nchar, HireDate date, SalariedFlag bit, VacationHours smallint, SickLeaveHours smallint, CurrentFlag bit, rowguid uniqueidentifier, ModifiedDate datetime)

```

can also get a Table representing the database table

```javascript

      function (asyncDone) {
        var parsedJSON = helper.getJSON()
        // construct a table type based on a table definition.
        var table = bulkMgr.asTableType()
        // convert a set of objects to rows representing the table
        table.addRowsFromObjects(parsedJSON)
        // use a type the native driver can understand, using column based bulk binding.
        var tp = sql.TvpFromTable(table)
        // can now use the tvp with the driver and bind all data in one go.
        theConnection.query('select * from ?;', [tp], function(err, res) {
          assert.deepEqual(res,parsedJSON)
          asyncDone()
        })
      }

```

## BigInt Strings ##

configure either the oonnection to return all numbers as strings.

```js
  test('query a numeric - configure connection to return as string', testDone => {
    async function runner () {
      const num = '12345678.876'
      theConnection.setUseNumericString(true)
      const q = `SELECT CAST(${num} AS numeric(11, 3)) as number`
      const res = await theConnection.promises.query(q)
      try {
        assert.deepStrictEqual(res.first[0].number, num)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

```

or issue as a query

```js
test('query a -ve numeric - configure query to return as string', testDone => {
    async function runner () {
      const num = '-12345678'
      const q = `select ${num} as number`
      const res = await theConnection.promises.query({
        query_str: q,
        numeric_string: true
      })
      try {
        assert.deepStrictEqual(res.first[0].number, num)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })
```

## Sybase Adaptive Server ##

the library runs most features against Sybase such as below with promised query or legacy callback.

```js
const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString
const query = 'SELECT top 5 * FROM syscomments'

// "Driver={Adaptive Server Enterprise}; app=myAppName; server=localhost port=5000; db=pubs3; uid=sa; pwd=ooooo;"

function legacyQuery () {
  return new Promise((resolve, reject) => {
    sql.open(connectionString, (err, con) => {
      if (err) {
        reject(err)
      }
      con.query(query, (err, rows) => {
        if (err) {
          reject(err)
        }
        con.close(() => {
          resolve(rows)
        })
      })
    })
  })
}

async function promised () {
  const connection = await sql.promises.open(connectionString)
  const res = await connection.promises.query(query)
  console.log(`promised ${JSON.stringify(res, null, 4)}`)
  await connection.promises.close()
  return res
}

async function q1 () {
  const d = new Date()
  try {
    const rows = await legacyQuery()
    const elapsed = new Date() - d
    console.log(`legacyQuery rows.length ${rows.length} elapsed ${elapsed}`)
    console.log(`legacyQuery ${JSON.stringify(rows, null, 4)}`)
  } catch (err) {
    console.error(err)
  }
}


```

## thread pooling ##

the library can now be used by a thread worker as outlined below.

master worker

```js

const path = require('path')
const filePath = path.resolve(__dirname, './worker-item.js')
const { Worker } = require('worker_threads')

const worker1 = new Worker(filePath)
const worker2 = new Worker(filePath)

function dispatch (worker) {
  worker.on('message', msg => {
    switch (msg.command) {
      case 'task_result': {
        console.log(JSON.stringify(msg, null, 4))
      }
    }
  })

  worker.on('error', error => {
    console.log(error)
  })
}

dispatch(worker1)
dispatch(worker2)

function sendTask (worker, num) {
  worker.postMessage(
    {
      command: 'task',
      num: num
    })
}

function clean () {
  setTimeout(async () => {
    console.log('exit.')
    await Promise.all([
      worker1.terminate(),
      worker2.terminate()
    ])
  }, 5000)
}

for (let i = 0; i < 40; i += 2) {
  sendTask(worker1, i)
  sendTask(worker2, i + 1)
}

clean()

```

worker

```js
const { parentPort } = require('worker_threads')
const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString

async function compute (msg) {
  try {
    console.log(`worker receive task ${msg.num}`)
    const conn = await sql.promises.open(connectionString)
    const query = `select ${msg.num} as i, @@SPID as spid`
    const res = await conn.promises.query(query)
    await conn.promises.close()
    parentPort.postMessage(
      {
        command: 'task_result',
        data: `spid ${res.first[0].spid}`,
        num: msg.num,
        fib: getFib(msg.num)
      })
  } catch (e) {
    parentPort.emit('error', e)
  }
}

parentPort.on('message', async msg => {
  switch (msg.command) {
    case 'task': {
      await compute(msg)
      break
    }
    default: {
      console.log(`unknown command ${msg.command}`)
      break
    }
  }
})

function getFib (num) {
  if (num === 0) {
    return 0
  } else if (num === 1) {
    return 1
  } else {
    return getFib(num - 1) + getFib(num - 2)
  }
}
```

## promises ##

see promises.ts under samples/typescript for some example code of how to use these promise methods.

Some promises have been added to the API for a more modern async approach. They are all collected under 'object.promises.promise' (pool.promises.open(), sql.promises.query(..), sql.promises.callProc(..), connection.promises.query(..) etc)

see index.js for definitions

```ts
export interface AggregatorPromises {
    query(sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    callProc(name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
}
   
interface SqlClientPromises  {
    query(conn_str: string, sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    callProc(conn_str: string, name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    open(conn_str: string): Promise<Connection>
}

export interface PoolPromises extends AggregatorPromises {
    open(): Promise<Pool>
    close(): Promise<any>
}

interface ConnectionPromises extends AggregatorPromises {
    prepare(sql: string): Promise<PreparedStatement>
    getTable(name: string): Promise<BulkTableMgr>
    close(): Promise<any>
    cancel(name: string): Promise<any>
}

export interface BulkTableMgrPromises
{
    select(cols: any[]): Promise<any[]>
    insert(rows: any[]): Promise<any>
    delete(rows: any[]): Promise<any>
    update(rows: any[]): Promise<any>
}

export interface PreparedPromises {
    free(): Promise<any>
    query(params?: any[], options?: QueryAggregatorOptions) : Promise<QueryAggregatorResults>
}

```

for example using the connection pool using promises.

### connection pool ###

``` ts

async function pool() {
    try {
        const connStr: string = getConnection()
        const size = 4
        const options: PoolOptions = {
            connectionString: connStr,
            ceiling: size
        }
        const pool: Pool = new sql.Pool(options)
        await pool.promises.open()
        const all = Array(size * 2).fill(0).map((_, i) => pool.promises.query(`select ${i} as i, @@SPID as spid`))
        const promised: QueryAggregatorResults[] = await Promise.all(all)
        const res = promised.map(r => r.first[0].spid)
        await pool.promises.close()
        console.log(`pool spids ${res.join(', ')}`)
    } catch (e) {
        console.log(e)
    }
}

```

### query ###

```ts
async function adhocQuery() {
    try {
        const connStr: string = getConnection()
        const res: QueryAggregatorResults = await sql.promises.query(connStr, 'select @@SPID as spid')
        console.log(`ashoc spid ${res.first[0].spid}`)
    } catch (e) {
        console.log(e)
    }
}

async function openSelectClose() {
    try {
        const connStr: string = getConnection()
        const conn: Connection = await sql.promises.open(connStr)
        const res: QueryAggregatorResults = await conn.promises.query('select @@SPID as spid')
        console.log(JSON.stringify(res, null, 4))
        await conn.promises.close()
    } catch (e) {
        console.log(e)
    }
}

```

### procedure ###

use a promise to open connection, call a proc and close all from one promise - or call from a connection. Note all results are aggregated i.e. you are returned a result containing all queries etc

```ts
async function adhocProc() {
    try {
        const connStr: string = getConnection()
        const proc = new ProcTest(connStr, sampleProc)
        await proc.create()    
        const msg = 'hello world'
        const res: QueryAggregatorResults = await sql.promises.callProc(connStr, sampleProc.name, {
            param: msg
        })        
        await proc.drop()
        console.log(`adhocProc returns ${res.returns} from param '${msg}''`)
    } catch (e) {
        console.log(e)
    }
}

async function proc() {
    try {
        const connStr: string = getConnection()
        const proc = new ProcTest(connStr, sampleProc)
        await proc.create()    
        const conn: Connection = await sql.promises.open(connStr)
        const promises: ConnectionPromises = conn.promises
        const msg = 'hello world'
        const res: QueryAggregatorResults = await promises.callProc(sampleProc.name, {
            param: msg
        })
       
        console.log(`proc returns ${res.returns} from param '${msg}''`)
        await proc.drop()
        await promises.close()
    } catch (e) {
        console.log(e)
    }
}
```

### table manager ###

use a promise to fetch a table and insert rows to it.

```ts
async function table() {
      try {
        const connStr: string = getConnection()
        const connection = await sql.promises.open(connStr)
        const tm: BulkTableTest = new BulkTableTest(connection, sampleTableDef)
        const table: BulkTableMgr = await tm.create()
        const vec: SampleRecord[] = getInsertVec(10)
        console.log(`table = ${tm.createTableSql}`)
        await table.promises.insert(vec)
        const read = await connection.promises.query(tm.selectSql)
        console.log(`table ${read.first.length} rows from ${tm.tableName}`)
        console.log(JSON.stringify(read.first, null, 4))
        await tm.drop()
        await connection.promises.close()
       } catch (e) {
        console.log(e)
      }
}
```

## Compiling The Driver ##

1. ensure visual studio 2015 is installed, community edition should be fine. If you do not want the full IDE it is also possible to build with the tools available from Microsoft [here](https://www.microsoft.com/en-us/download/details.aspx?id=48159)
1. make sure you have latest version of node installed.
1. install node-gyp globally :- npm install -g node-gyp
1. download and install the git [client](https://git-scm.com/downloads)
1. clone the code base :- git clone [git-src](https://github.com/TimelordUK/node-sqlserver-v8.git) msnodesqlv8
1. start a shell command and cd into new folder :- copy bindingdotgyp.old binding.gyp
1. make sure [Python27](https://www.python.org/downloads/) is installed
1. node-gyp clean configure build --verbose --arch=x64
1. if you wish to edit and compile code for Debug, open the generated solution file in VS2015. i.e. build\binding.sln
1. copy the node.lib to Debug for example C:\Users\<usr>\.node-gyp\6.10.0\Debug from x64 folder.
1. build from visual studio.
1. to run this target change to debug mode from file [sqlserver.native.js](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/lib/sqlserver.native.js)

## Async Patterns ##

can convert the API easily into a promise based API

```javascript
async function test (request, response) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/plain')

  let sqlOpen = toPromise(sql.open)
  try {
    let connection = await sqlOpen(connectionString)
    let connectionQuery = toPromise(connection.queryRaw)
    try {
      let d = new Date()
      let data = await connectionQuery(query)
      let elapsed = new Date() - d
      response.end(JSON.stringify(data, null, 4))
      let close = toPromise(sql.close)
      await close()
    } catch (err) {
      response.end(err.message)
    }
  } catch (err) {
    response.end(err.message)
  }
}

\\ use any conversion utility ....

function toPromise (f) {
  return function (args) {
    return new Promise((resolve, reject) => {
      function handler (err, res) {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    }

    if (args) {
      f(args, handler)
    } else {
      f(handler)
    }
  })
  }
}

```

the msnodesqlv8 library works nicely with the brilliant library [asynquence](https://github.com/getify/asynquence) written by  Kyle Simpson.  Here it is possible to run many different sorts of patterns but using generators to manage an iteration of promises is particularly worth noting.

here the little promise based [wrapper](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/lib/MsNodeSqWrapperModule.ts) has been used to provide promises around the driver.  This code and others like it can be found in the wrapper [test](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/DriverModuleTest.js)

now operations can be made to look "serialsed" letting AQS manage the iteration.  There are many other patterns avaialble such as gates and waterfalls.

``` javascript

let ASQ = require('asynquence-contrib');
testPrepare: string = `select len(convert(varchar, ?)) as len`;

private prepare(): Promise<any> {
    let inst = this;
    return new Promise((resolve, reject) => {
        ASQ().runner(function *() {
            let connection = yield inst.sqlWrapper.open();
            let command = connection.getCommand().sql(inst.testPrepare);
            command = yield command.prepare();
            let res = yield command.params([1000]).execute();
            assert.deepEqual(res.asObjects, inst.expectedPrepared, "results didn't match");
            yield command.freePrepared();
            yield connection.close();
            resolve();
        }).or((e: any) => {
                reject(e);
            }
        )
    })
}

```

### User Binding ###

By default, the driver will guess the appropriate type based on the type passed in. The api contains methods to force the driver to assign a given type if required.

```typescript

conn.query("declare @v tinyint = ?; select @v as v", [sql.TinyInt(255)],
        (err, res) => {});

```

```typescript

Bit(v:number): any;
BigInt(v:number): any;
Int(v:number): any;
TinyInt(v:number): any;
SmallInt(v:number): any;
Float(v:number): any;
Numeric(v:number): any;
Money(v:number): any;
SmallMoney(v:number): any;
Decimal(v:number): any;
Double(v:number): any;
Real(v:number): any;
WVarChar(v:String) : any;
Char(v:String) : any;
VarChar(v:String) : any;
NChar(v:String) : any;
NVarChar(v:String) : any;
Text(v:String) : any;
NText(v:String) : any;
Xml(v:String) : any;
WLongVarChar(v:string) : any;
UniqueIdentifier(v:String) : any;
VarBinary(v:any) : any;
LongVarBinary(v:any) : any;
Image(v:any) : any;
Time(v:Date) : any;
Date(v:Date) : any;
DateTime(v:Date) : any;
DateTime2(v:Date) : any;
DateRound(v:Date) : any;
SmallDateTime(v:Date) : any;
DateTimeOffset(v:Date) : any;

```

### Connecting ###

Ensure the module has been installed first.

A standard connection string can be used to open a connection to the database. Note that in the example below a trusted connection is used and hence authentication is based on the windows login ID used for executing the instance of Node JS.   You can also use a connection string where user and password is specified using a SQL Server account.

use the sql.open function :-

``` javascript

var sql = require('msnodesqlv8');
function connect() {
    var connStr = "Driver={SQL Server Native Client 11.0};Server=<host>;Database={scratch};Trusted_Connection=Yes;";
    sql.open(connStr, function (err, conn) {
        assert.ifError(err);
        // connection is now ready to use.
    });
}

```

A Timeout in seconds can be specified to hand into the driver :-

``` javascript

var sql = require('msnodesqlv8');
function connect_timeout() {
    var co = {
        conn_str: connStr,
        conn_timeout: 2 // specified in seconds.
    };
    sql.open(co, function (err, conn) {
        if (err) {
            console.log(err);
            return;
        }
    });
}

```

### Pool ###

you can now submit queries through a native library connection pool.  This pool creates a set of connections and queues work submitting items such that all connections are busy providing work exists.  A keep alive is sent periodically to check connection integrity and idle connections beyond a threshold are closed and re-created when queries submitted at a later point in time. Queries can be cancelled and paused / resumed regardless of where they are in the work lifecycle

examples can be seen [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/unit.tests/connection-pool.js) and [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/samples/javascript/pooling.js)

#### call procedure via the pool ####

```typescript

// call a proc - omit callback and listen to events
const q = pool.callproc (name, paramsOrCb, function (err, results, output, more) { })) 

// helper promise to accumulate results, info messages, output variables
const q = await pool.callprocAggregator(procName, o, options)

```

```javascript

export interface PoolOptions {
    floor?: number
    ceiling?: number
    heartbeatSecs?: number
    heartbeatSql?: string
    inactivityTimeoutSecs?: number
    useUTC?:boolean
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

## Register Stored Procedure ##

when running against SQLServer, the library will try and fetch a stored procedure definition from the database hence it will be registered automatically and cached

However for other ODBC connections such as Sybase the proc must be registered manually.

see examples below for usage

```js
async function runProcWith (connection, spName, p) {
  console.log(`call proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
  const res = await connection.promises.callProc(spName, p)
  const returns = res.first[0]['']
  console.log(`proc with params returns ${returns}`)
}

async function makeProc (connection, spName) {
  try {
    const pm = connection.procedureMgr()
    const def = `create or replace proc tmp_name_concat 
  @last_name varchar(30) = "knowles", 
  @first_name varchar(18) = "beyonce" as 
  select @first_name + " " + @last_name `

    await connection.promises.query(def)

    const params = [
      pm.makeParam(spName, '@last_name', 'varchar', 30, false),
      pm.makeParam(spName, '@first_name', 'varchar', 18, false)
    ]

    const proc = pm.addProc(spName, params)
    proc.setDialect(pm.ServerDialect.Sybase)
    return proc
  } catch (err) {
    console.error(err)
  }
}

async function proc () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_name_concat'
  await makeProc(connection, spName)

  try {
    await runProcWith(connection, spName, {
      first_name: 'Baby'
    })
    await runProcWith(connection, spName, {})
    await runProcWith(connection, spName, {
      first_name: 'Miley',
      last_name: 'Cyrus'
    })

    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

async function runOutputProcWith (connection, spName, p) {
  console.log(`call output proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
  const res = await connection.promises.callProc(spName, p)
  console.log(`output proc with params returns ${JSON.stringify(res, null, 4)}`)
}

async function makeOutputProc (connection, spName) {
  try {
    const pm = connection.procedureMgr()
    const def = `create or replace proc tmp_square 
    @num decimal, 
    @square decimal output as 
  select @square=@num* @num`

    await connection.promises.query(def)

    const params = [
      pm.makeParam(spName, '@num', 'decimal', 17, false),
      pm.makeParam(spName, '@square', 'decimal', 17, true)
    ]

    const proc = pm.addProc(spName, params)
    proc.setDialect(pm.ServerDialect.Sybase)
    return proc
  } catch (err) {
    console.error(err)
  }
}

async function procOuput () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_square'
  await makeOutputProc(connection, spName)

  try {
    await runOutputProcWith(connection, spName, {
      num: 15
    })

    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

async function makeSelectProc (connection, spName) {
  try {
    const pm = connection.procedureMgr()
    const def = `create or replace proc tmp_input_output
    @len_last int output,
    @len_first int output,
    @first_last varchar(48) output, 
    @last_name varchar(30) = 'knowles', 
    @first_name varchar(18) = 'beyonce'
    as begin
      select @first_last = @first_name + " " + @last_name
      select @len_first = len(@first_name)
      select @len_last = len(@last_name)
      select len(@first_last)
    end`

    await connection.promises.query(def)

    const params = [
      pm.makeParam(spName, '@len_last', 'int', 4, true),
      pm.makeParam(spName, '@len_first', 'int', 4, true),
      pm.makeParam(spName, '@first_last', 'varchar', 48, true),
      pm.makeParam(spName, '@last_name', 'varchar', 30, false),
      pm.makeParam(spName, '@first_name', 'varchar', 18, false)
    ]

    const proc = pm.addProc(spName, params)
    proc.setDialect(pm.ServerDialect.Sybase)
    return proc
  } catch (err) {
    console.error(err)
  }
}

async function procAsSelect () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_input_output'

  try {
    const proc = await makeSelectProc(connection, spName)
    const meta = proc.getMeta()
    const select = meta.select
    console.log(select)
    const res = await connection.promises.query(select, ['Miley', 'Cyrus'])
    console.log(JSON.stringify(res, null, 4))
    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

```



## Executing Stored Procedures ##

### call a procedure directly from opened connecion or pool ###

```typescript

var q = connOrPool.callproc (name, paramsOrCb, function (err, results, output, more) { })) 

```

use the connection procedure manager to execute stored procedures.

```typescript

var pm = conn.procedureMgr();

```

now you can use an input object to send in params

```javascript
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT = ${a},
      @b INT = ${b}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`
```

fetch the stored proc using the proc manager

```javascript
        const pm = theConnection.procedureMgr()
        pm.get(spName, proc => {
            // can now call the proc with input object or legacy param array.
        }
```

to call with no params, the driver now assumes they are default input and will not bind them i.e.

```javascript
          const o = {}
          proc.call(o, (err, results, output) => {
```

you can bind one param

```javascript
        // default param b wil not be bound by driver
        const o = {
             a: 10
         }
        proc.call(o, (err, results, output) => { })
```

or both

```javascript
          // bind both a an b overriding defaults.
          const o = {
             a: 10,
             b: 20
         }
          proc.call(o, (err, results, output) => { })
```

an example including all output and 1 optional

```javascript
    const a = 20
    const def = `alter PROCEDURE <name> (
      @t1 INT out,
      @t2 INT out,
      @t3 INT out,
      @a INT = ${a}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @t1 = @a;
      set @t2 = @a * 2;
      set @t3 = @a * 3;
    end;
    `
          // use the default input and collect output variables.
          const o = {}
          proc.call(o, (err, results, output) => {
            assert.ifError(err)
            if (output) {
              assert(Array.isArray(output))
              const expected = [
                0,
                a,
                a * 2,
                a * 3
              ]
              assert.deepStrictEqual(expected, output)

```

assuming a stored procedure exists in the database as below, where two input int are passed in, added together by the procedure and returned as an output parameter.

```sql

USE [scratch]
CREATE PROCEDURE [dbo].[test_sp_get_int_int](
    @num1 INT,
    @num2 INT,
    @num3 INT OUTPUT
)AS
    BEGIN
        SET @num3 = @num1 + @num2
        RETURN 99;
    END
GO

```

with a connection opened, the stored procedure manager can be used to execute a proc :-

```javascript

function exec_proc(conn) {
    var pm = conn.procedureMgr();
    pm.callproc('test_sp_get_int_int', [10, 5], function(err, results, output) {
        var expected = [99, 15];
        assert.deepEqual(output, expected, "results didn't match");
    });
}

```

The return value will always be the first member of the output vector.  In this case that value has been assigned 99.  Each output parameter in order will then appear, in this case we have the sum of the input parameters
On first invocation, the procedure manager will ask the server to return the meta data associated with the procedure.   This information is cached and used on subsequent calls.  The information is held alongside that connection in the library and hence will be lost each time the connection is closed.

If you wish to see what information is stored for a procedure without actually executing it, the describe function may help.  It will callback with the associated meta data showing parameters and sql signature used to invoke the procedure.

```javascript

function describe() {
    sql.open(connStr, function (err, conn) {
        assert.ifError(err);
        var pm = conn.procedureMgr();
        pm.describe('test_sp_get_int_int', function (meta) {
            console.log(meta);
        });
    });
}

```

As an alternative, a procedure object can be fetched by an application where a call method can be called.  A helper property 'select' is available on the meta data which alows a query to be submitted to invoke a stored procedure if that is preferred.  Else use the method call on the returned proc.

```javascript

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          var meta = proc.getMeta()
          // use an mssql style select
          var s = meta.select
          theConnection.query(s, [10, 5], function (err, results) {
            assert.ifError(err)
            var expected = [{
              num3: 15,
              ___return___: 99
            }]
            assert.deepEqual(results, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }

```

```javascript

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          var count = pm.getCount()
          assert.equal(count, 1)
          proc.call([10, 5], function (err, results, output) {
            var expected = [99, 15]
            assert.ifError(err)
            assert.deepEqual(output, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }

```

Where no parameters are required, simply omit the array and provide name and callback function only :-

```javascript

pm.callproc('test_no_param', function(err, results, output) {
});

```

A global timeout can be given in seconds to the procedure manager which will be sent to the driver on every call made through it.  Hence an error will be raised should the procedure not complete within the allocated time.

```javascript

pm.setTimeout(2);

```

### Prepared Statements ###

If SQL statements are repeatedly executed many times during the execution of a node program, a user may choose to encapsulate some into stored procedures which are compiled server side.

An alternative now available is the use of prepared statements available in this module.  Prepared statements fetch meta data describing the query, allocate memory on the client which is bound to the columns representing the query.  This is done just once, where each call then only requires potential parameters to be bound.  This means efficiency gains over the same SQL string being submitted each time to the database.

Once a connection has been opened, the prepare function can be used to prepare a statement.  The provided callback is invoked with an object on which the preparedQuery will allow repeated invocations.  If necessary, different parameters can be included :-

```typescript

function employeePrepare(done) {
    var query =
        `SELECT [ModifiedDate]
            ,[BusinessEntityID]
            ,[OrganizationNode]
            ,[ModifiedDate]
        FROM [scratch].[dbo].[Employee]
            WHERE BusinessEntityID = ?`;

sql.open(connStr,  (err, conn) => {
    assert.ifError(err);
    conn.prepare(query, (e, ps) => {
        assert.ifError(err);
        ps.preparedQuery([1], (err, fetched) => {
            console.log(ps.getMeta());
            console.log(fetched);
            ps.free(() => {
                    done();
                })
            });
        });
    });
}

```

The prepared statement can be used until the free function is invoked.  This call is necessary to release the resources associated with the statement.  Clearly with poor client side management, leaks are possible.  Take care to ensure once the statement is finished with, the free function is called. A collection of the most frequently called statements can be collected by a client into a useful object for use throughout the application.

Some helper functions are avaialble for each prepared statement :-

```javascript

var meta = ps.getMeta(); // column meta data reserved in driver
var sql = ps.getSignature(); // the sql used to create prepared statement.
var id = ps.getId();  // unique integer reprenting statement

```

There are some more examples in the test file prepared.js.

### Executing A Query ###

for adhoc queries, a connection can opened, sql submitted and results collected all in one call.  The driver will close the connection when completed :-

```javascript

function connectQuery() {
    var q = "declare @s NVARCHAR(MAX) = ?; select @s as s";
    sql.query(connStr, q, ['node is great'], function (err, res) {
        assert.ifError(err);
        console.log(res);
    });
}

```

If the client will be submitting many queries within close proximity of time, it is probably better to open a connection explicitly.  This connection can then be used to make may calls.  This will generally be more efficient but will hold a connection to database open for the lifetime of the client.  Holding many connections can impact overall performance.   The design to use is therefore dependent on requirements.

```javascript

function openQuery() {
    sql.open(connStr, function (err, conn) {
        assert.ifError(err);
        var q = "declare @s NVARCHAR(MAX) = ?; select @s as s";
        conn.query(q, ['node is great'], function (err, res) {
            assert.ifError(err);
            console.log(res);
        });
    });
}

```

Where required, a timeout in seconds can be specified for a specific query.  In this case, an error will be raised should the query not return within the allocated period.

```javascript

function timeout() {
    sql.open(connStr, function (err, conn) {
    var queryObj = {
        query_str: "waitfor delay \'00:00:10\';",
        query_timeout: 2
    };

    conn.query(queryObj, function (err, res) {
            assert(err != null);
            assert(err.message.indexOf('Query timeout expired') > 0);
        });
    })
}

```

### query() vs queryRaw() ###

If the query() function is used on the API, the raw row results returned by the database are converted to javascript objects such that an array of objects are returned, where each in the array represents a single row.

however, raw rows can be fetched where an object is returned thus :-

```javascript

{
    meta: [],
    rows: []
}

```

this is illustrated below where `res.rows` would be an array of arrays where each sub array contains each column.

```javascript

function employee() {
    sql.open(connStr, function (err, conn) {
       conn.queryRaw("select * from Employee", function (err, res) {
           console.log(b);
           assert.ifError(err);
           console.log(res);
        });
    });
}

```

### pause A Query ###

examples can be seen [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/unit.tests/pause.js)

It may be necessary in stream mode to periodically pause a query to process a set of rows before resuming the next batch.  This can be done as follows using the pauseQuery and resumeQuery API.

```javascript

  test('pause a large query every 100 rows', testDone => {
    let expected = 0
    const q0 = theConnection.query(`select top 3000 * from syscolumns`)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.resumeQuery()
        }, 50)
      }
    })
    q.on('done', () => {
      assert.strictEqual(expected, rows)
      testDone()
    })
  })

```

a paused query can be cancelled without having to be in a polling mode.

```javascript

  test('pause a large query and cancel without resume', testDone => {
    let rows = 0
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.cancelQuery(() => {
            testDone()
          })
        }, 50)
      }
    })
  })

```

if a new query is submitted using a connection with a pending paused query then the paused is killed to allow the next to execute.

``` javascript

  test('pause a large query to only get 10 rows then submit new query whilst other paused (first killed)', testDone => {
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    const pauseAt = 10
    let rows = 0
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 10 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          assert.strictEqual(pauseAt, rows)
          // submit a new query will kill previous
          theConnection.query(`select top 3000 * from syscolumns`, (err, res) => {
            assert.ifError(err)
            assert(Array.isArray(res))
            testDone()
          })
        }, 200)
      }
    })
  })

```

### Geography ###

examples can be seen [here](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/unit.tests/geography.js)

for example using procedure

``` sql

create PROCEDURE InsertGeographyTvp @tvp geographyTvpType READONLY
       AS
       BEGIN
       set nocount on
       INSERT INTO spatial_test
       (
          GeogCol1
        )
        SELECT  (case
        when GeogCol1 like 'POINT%'
        then geography::STPointFromText([GeogCol1], 4326)
        when GeogCol1 like 'LINE%'
        then geography::STLineFromText([GeogCol1], 4326)
        when GeogCol1 like 'POLY%'
        then geography::STPolyFromText([GeogCol1], 4326)
        end )
  n FROM @tvp tvp
  END
```

where table and type is

``` sql

CREATE TABLE spatial_test ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText() )
create type ${tableTypeName} AS TABLE ([GeogCol1] nvarchar (2048))`

```

then can send a set of geography types in one go

``` javascript

test('use tvp to insert geography LINESTRING, POINT and POLYGON using pm in 1 call', testDone => {
    let table
    let procedure
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const points = geographyHelper.asPoints(coordinates)
    const polygon = geographyHelper.asPoly(coordinates)
    const allGeography = lines.concat(points).concat(polygon)
    const expected = geographyHelper.asExpected(allGeography)
    const fns = [

      asyncDone => {
        geographyHelper.createGeographyTable(async, theConnection, t => {
          table = t
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('InsertGeographyTvp', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },
      asyncDone => {
        allGeography.forEach(l => {
          // each row is represented as an array of columns
          table.rows[table.rows.length] = [l]
        })
        const tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === allGeography.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })
```

### Cancel A Query ###

easiest way to cancel now is probably with pause then cancel

``` javascript

  test('pause a large query and cancel without resume', testDone => {
    let rows = 0
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.cancelQuery(() => {
            testDone()
          })
        }, 50)
      }
    })
  })

```

From version 0.3.1 onwards the library now supports query cancel.  This can only be achieved with queries submitted on polling based statements.

```javascript

    sql.PollingQuery("waitfor delay \'00:00:20\';")

```

examples are provided in the unit test file below.

[querycancel.js](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/test/querycancel.js)

```javascript

       var q = theConnection.query(sql.PollingQuery("waitfor delay \'00:00:20\';"), function (err) {
            assert(err);
            assert(err.message.indexOf('Operation canceled') > 0);
            test_done();
        });

        q.cancelQuery(function (err) {
            assert(!err);
        });

```

in the above example, the driver is instructed to use polling based query submission, thus allowing the cancelQuery function to be called.  In polling mode, performance is reduced, this will not be noticed for long running queries but will for large numbers of short running queries.  Hence this mode by default is switched off and for any applications not using cancel based queries the driver behaves exactly as before.

prepared queries can also be cancelled as shown in the example below. Note the submitted event is used to indicate when a query has actually been sent to the c++ driver.  If a cancel is issued on a statement before submission it will be "soft" removed from the work queue and hence never submitted to the driver. This would be the case on back to back queries sent through the connection where the driver will work to complete one whilst holding back the rest.

```javascript

        var fns = [
            function (async_done) {
                theConnection.prepare(sql.PollingQuery(s), function (err, pq) {
                    assert(!err);
                    prepared = pq;
                    async_done();
                });
            },

            function (async_done) {
                var q = prepared.preparedQuery(['00:00:20'], function (err, res) {
                    assert(err);
                    assert(err.message.indexOf('Operation canceled') > 0);
                    async_done();
                });

                q.on('submitted', function() {
                    q.cancelQuery(function(err) {
                        assert.ifError(err);
                    });
                });
            }
        ];

        async.series(fns, function () {
            test_done();
        })

```

cancel can also be called on a stored proc call, in this case polling needs to be enabled on the proc manager itself.

```javascript

            function (async_done) {
                var pm = theConnection.procedureMgr();
                pm.setPolling(true); // allow polling
                var q = pm.callproc(sp_name, ['0:0:20'], function (err) {
                    assert(err);
                    assert(err.message.indexOf('Operation canceled') > 0);
                    async_done();
                });
                q.on('submitted', function () {
                    q.cancelQuery(function (err) {
                        assert(!err);
                    });
                });

```

an error is expected when trying to cancel a query running on a blocked statement. This will be reported on the callback to the cancel and the execuring query will remain executing to completion.

```javascript

        var q = theConnection.query("waitfor delay \'00:00:3\';", function (err) {
            assert(!err);
            test_done();
        });

        theConnection.cancelQuery(q, function (err) {
            assert(err);
            assert(err.message.indexOf('only supported') > 0);
        });

```

## subscribing to driver events ##

When executing a query, certain events will be raised by the driver as it progresses. These events can be useful for debugging or drilling into performance measurements.  The examples below show how to subscribe to these events.

Note if no callback is provided and an all event streaming approach is taken, one advantage is data is handed back without being cached in the driver.  When the result set becomes large this can be a substantial amount of memory whilst the row set is read to completion.

By processing data via the streaming api a more efficient approach can be taken and reduce large volitity in memory footprint.

It should be noted that a large single column (e.g. 50k binary or text) will result in many smaller transactions between the driver and javascript until the entire column is read.  In this case the data is held before being released and freed via the column event.

```javascript

var s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'";
console.log(s);
var q = conn.query(s, function (err, res) {
    assert.ifError(err);
    console.log("res.length = " + res.length);
    console.log(res);
});

q.on('meta', function(meta) {
    console.log('meta[0].name = ' + meta[0].name);
});

q.on('column', function(colIndex, data) {
    console.log('column = ' + colIndex);
});

q.on('rowcount', function(count) {
    console.log('rowcount = ' + count);
});

q.on('row', function(row) {
    console.log('row = ' + row);
});

q.on('done', function() {
    console.log('done');
});

q.on('error', function(err) {
    console.log(err.message);
});

q.on('info', function(err) {
    console.log(err.message);
});

q.on('submitted', function(q) {  // when driver is actually working this query.
    console.log(JSON.stringify(q);
});

```

### Capture Print ###

use the info event as illustrated below.

```javascript
       sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }

            setInterval(() => {
                let q = conn.query(`print 'JS status message ${x}'; SELECT ${x} + ${x} as res;SELECT ${x} * ${x} as res2`,
                    (err, results, more) => {
                        if (more && !err && results && results.length === 0) {
                            return;
                        }
                        console.log(`[${x}] more = ${more} err ${err} results ${JSON.stringify(results)}`);
                        if (more) return;
                        ++x;
                    });
                q.on('info', (e:Error) => {
                    console.log(`print: ${e.message.substr(e.message.lastIndexOf(']') + 1)}`)
                })
            }, delay);
        });
```

### Table Binding ###

The connection table manager can be useful in interacting with a single table :-

```javascript

var tm = conn.tableMgr();

```

to interact with a specific table, first invoke bind and provide a callback which will be invoked when the manager is ready :-

```javascript

tm.bind('Employee', onBind);

```

now insert some rows into the table.

```javascript

function onBind(bulkMgr) {
    // get an array of objects represented by the bound table.
    var parsedJSON = helper.getJSON();
    bulkMgr.insertRows(parsedJSON, insertDone);
}

```

note that this is achieved with a single transaction to the server as memory is reserved for the entire insert, hence this can save network overhead of individual insert statements.

updates can also be sent against a set of rows in one transaction. For example, update column ModifiedDate based on primary key BusinessEntityID :-

```javascript

function insertDone(err, res) {
    assert.ifError(err);
    assert(res.length == 0);
    var newDate = new Date("2015-01-01T00:00:00.000Z");
    var modifications = [];
    parsedJSON.forEach(function(emp) {
        emp.ModifiedDate = newDate;
        modifications.push( {
            BusinessEntityID : emp.BusinessEntityID,
            ModifiedDate : newDate
        });
    });
    var updateCols = [];
    updateCols.push({
      name : 'ModifiedDate'
    });
    bulkMgr.setUpdateCols(updateCols);
    bulkMgr.updateRows(modifications, updateDone);
}

```

Note in the above example, the modified vector from parsedJSON could also be sent to the driver for the update.  The method setUpdateCols is required to indicate which columns are being modified.

The summary can be used to re-assign all updateable columns :-

```javascript

function updateDone(err, res) {
    assert.ifError(err);
    assert(res.length == 0);
    var summary = bulkMgr.getSummary();
    bulkMgr.setUpdateCols(summary.assignableColumns);
}

```

A batch size can be specified where the input vector is split and submitted in sets of that batch size.

```javascript

bulkMgr.setBatchSize(batchSize);

```

Rows can also be fetched based for example on primary key :-

```javascript

function insertDone(err, res) {
    assert.ifError(err);
    var keys = extractKey(parsedJSON, 'LoginID');
    bulkMgr.selectRows(keys, bulkDone);
}

```

Where non primary key selects are required, use the setWhereCols function :-

```javascript

function insertDone(err, res) {
    assert.ifError(err);
    var whereCols = [];
    whereCols.push({
        name : 'LoginID'
    });
    var parsedJSON = helper.getJSON();
    var keys = extractKey(parsedJSON, 'LoginID');
    bulkMgr.setWhereCols(whereCols);
    bulkMgr.selectRows(keys, bulkDone);
}

```

Rows can also be deleted based on the where condition :-

```javascript

function insertDone(err, res) {
    assert.ifError(err);
    var whereCols = [];
    whereCols.push({
        name : 'LoginID'
    });
    var parsedJSON = helper.getJSON();
    var keys = extractKey(parsedJSON, 'LoginID');
    bulkMgr.setWhereCols(whereCols);
    bulkMgr.deleteRows(results, bulkDone);

}

```

Note, that the table mananger can be used along with prepared statements such as below where the table manager is used to fetch column data for a table, and then a prepared statement used against the generated select signature.

```javascript

    // use the select signature to construct a prepared query.
function(async_done) {
    var summary = bulkMgr.getSummary();
    console.log(summary.select_signature);
    console.log("prepare the above statement.");
    var select = summary.select_signature;
    conn.prepare(select, function(err, ps) {
        assert.ifError(err);
        ps.preparedQuery([1], function(err, res) {
            assert.ifError(err);
            assert.check(res.length == 1);
            async_done();
        });
    });
}

```

### summary of table manager api ###

In summary, the table manager can help when interacting with individual tables by allowing objects to be inserted, updated, deleted and selected.

```typescript

bulkMgr.insertRows([], cb); // bulk insert objects.
bulkMgr.selectRows([], cb); // select based on where columns.
bulkMgr.deleteRows([], cb); // delete based on where columns.
bulkMgr.updateRows([], cb); // update based on where columns.

bulkMgr.setBatchSize(batchSize); // submit vector in batches to server.
bulkMgr.setWhereCols([]); // set the where condition for select,delete and update.
bulkMgr.setUpdateCols([]); // set which columns will be updated from input vector.

bulkMgr.getMeta(); // obtain interesting information for bound table.
bulkMgr.columns(); // all columns for the table.
bulkMgr.getSummary(); // gives sql signatures for the table.

```

### BCP ###

you must be on only ODBC 17 to use this feature.

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

This protocol is not part of the ODBC specification and its use therefore depends on using correct ODBC driver.  For linux users, this should work out the box as ODBC 17 is the only driver supported and this is one used for BCP.  The feature has been tested on Ubuntu, MacOS, Debian and Alpine.

For windows users, older drivers can still be used on all non bcp functions just as before - however presently only ODBC 17 is supported for bcp. Hence you need to have installed ODBC data source "ODBC Driver 17 for SQL Server".  No other driver will work and attempts to do so will probably crash the node instance.

see wiki for more details or bcp unit tests - bcp is accessed via the table manager i.e. binding to a table and enabling bcp on that table returned.

## Easiest Way To See Library Being Used ##

[mssql-demo.js](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/mssql-demo.js)

The demo file is a pretty good place to see many of the features being used.

make sure an instance of database is available to connect too.  Edit the connection with the appropriate string.

from command line, navigate to where the npm module has been installed :-

```javascript

    admin@DESKTOP MINGW64 ~/dev/js/test/node_modules/node-sqlserver-v8 (master)
    $ node mssql-demo.js

```

The demo is divided into a set of distinct areas.  Open the file, look for the `var demos` array and edit down to 1 or more tests to focus on a particular area.  Hopefully the demo file provides some snippets which can be copied for use in your own programs.

If no SQL server instance is available to connect too, or indeed simply as an excellent test environment [sqllocaldb](https://www.microsoft.com/en-in/download/details.aspx?id=42299&WT.mc_id=rss_alldownloads_devresources&wa=wsignin1.0) is highly recommended. Select SqlLocalDB.msi and install.  Once complete, from a command shell prompt (cmd), use the following commands :-

```javascript

sqllocaldb create node
sqllocaldb start node
sqllocaldb info node

```

The create command is only required to be run once. Next, if not already installed, download SQLManagementStudio_x64_ENU.exe from same location (or x86 for 32 bit platforms). If you do any work at all with SQL server this is a superb and invaluable full featured IDE to develop and run SQL.

using the connection details provided by info, you should be able to connect to the database instance.  Create a database for use with the demo and your own development. This can be done in the IDE by right clicking on Databases and selecting New Database.

Note, some useful commands are shown [here](http://stackoverflow.com/questions/14153509/how-to-prevent-sql-server-localdb-auto-shutdown) which prevents your local SQL server instance from shutting down within a period of inactivity.  Very useful during periods of development.

if you wish to run a unit test through an IDE, then for example install visual studio code mocha sidebar and run a test

ensure the connection details are added in .env-cmdrc

the test are run with command line mocha

npm run test. Look at the setup for appveyor.yml as an example.

provides a simple start point.  Simply change the test run to whichever you require such as [query.js](https://github.com/TimelordUK/node-sqlserver-v8/blob/master/test/query.js)
