'use strict'
/* global suite teardown teardown test setup */

const supp = require('../samples/typescript/demo-support')
const assert = require('assert')
const util = require('util')

suite('tvp', function () {
  let theConnection
  this.timeout(20000)
  let connStr
  let async
  let helper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert.ifError(err)
      done()
    })
  })

  class TvpHelper {
    constructor (theConnection, tableName) {
      let schemaName = 'dbo'
      let unqualifiedTableName = tableName
      const schemaIndex = tableName.indexOf('.')
      if (schemaIndex > 0) {
        schemaName = tableName.substr(0, schemaIndex)
        unqualifiedTableName = tableName.substr(schemaIndex + 1)
      }
      const createSchemaSql = `IF NOT EXISTS (
  SELECT schema_name
  FROM  information_schema.schemata
  WHERE schema_name = '${schemaName}')
  BEGIN
   EXEC sp_executesql N'CREATE SCHEMA ${schemaName}'
  END`

      const tableTypeName = `${tableName}Type`
      const insertProcedureTypeName = `${schemaName}.Insert${unqualifiedTableName}`
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
    DROP TABLE ${tableName};`

      const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${insertProcedureTypeName}'))
   begin drop PROCEDURE ${insertProcedureTypeName} end `

      const createTableSql = `create TABLE ${tableName}(
  \tdescription varchar(max),
  \tusername nvarchar(30), 
  \tage int, 
  \tsalary real,
  \tcode numeric(18,3),
  \tstart_date datetime2
  )`

      const dropTypeSql = `IF TYPE_ID(N'${tableTypeName}') IS not NULL drop type ${tableTypeName}`

      const createTypeSql = `CREATE TYPE ${tableTypeName} AS TABLE (description varchar(max), username nvarchar(30), age int, salary real, code numeric(18,3), start_date datetime2)`

      const insertProcedureSql = `create PROCEDURE ${insertProcedureTypeName}
  @tvp ${tableTypeName} READONLY
  AS
  BEGIN
   set nocount on
   INSERT INTO ${tableName}
  (
     [description],
     [username],
     [age],
     [salary],
     [code],
     [start_date]
   )
   SELECT 
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
  n FROM @tvp tvp
  END`

      const callProcFromProcName = 'callProcedureFromProcedure'
      const dropCallProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${callProcFromProcName}'))
      begin drop PROCEDURE ${callProcFromProcName} end`

      const callProcedureFromProcedureSql = `create PROCEDURE ${callProcFromProcName}
  (
        @description varchar(max),
        @username nvarchar(30),
        @age int,
        @salary real,
        @code numeric(18,3),
        @start_date datetime2
  )
  AS
  BEGIN
   set nocount on
  
   declare @TmpTvpTable TestTvpType;
   INSERT @TmpTvpTable
   (
     [description],
     [username],
     [age],
     [salary],
     [code],
     [start_date]
   )
   values
  (
     @description,
     @username,
     @age,
     @salary,
     @code,
     @start_date
   )
   
  execute InsertTestTvp @TmpTvpTable;
  
  SELECT 'Insert Complete';
  
  WAITFOR DELAY '000:00:02';
  
  execute InsertTestTvp @TmpTvpTable;
  
  SELECT 'Insert 2 Complete';
  
   SELECT 
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
  FROM TestTvp;
  
  END
  `

      const localTableProcName = 'localTableProcedure'
      const dropLocalTableProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${localTableProcName}'))
      begin drop PROCEDURE ${localTableProcName} end`

      const localTableProcNameSql = `create PROCEDURE ${localTableProcName}
  (
        @description varchar(max),
        @username nvarchar(30),
        @age int,
        @salary real,
        @code numeric(18,3),
        @start_date datetime2
  )
  AS
  BEGIN
   set nocount on
  
   declare @TmpTvpTable AS TABLE (description varchar(max), username nvarchar(30), age int, salary real, code numeric(18,3), start_date datetime2);
   -- declare @TmpTvpTable TestTvpType;
   INSERT @TmpTvpTable
   (
     [description],
     [username],
     [age],
     [salary],
     [code],
     [start_date]
   )
   values
  (
     @description,
     @username,
     @age,
     @salary,
     @code,
     @start_date
   )
   
  SELECT 'Insert Complete';
  
   SELECT 
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
  FROM @TmpTvpTable;
  
  SELECT 'Select Complete';
  
  END
  `
      async function create () {
        async function exec (sql) {
          // console.log(`exec '${sql}' ....`)
          const promisedQuery = util.promisify(theConnection.query)
          await promisedQuery(sql)
          // console.log('... done')
        }

        await exec(createSchemaSql)
        await exec(dropProcedureSql)
        await exec(dropCallProcedureSql)
        await exec(dropLocalTableProcedureSql)
        await exec(dropTableSql)
        await exec(createTableSql)
        await exec(dropTypeSql)
        await exec(createTypeSql)
        await exec(insertProcedureSql)
        await exec(callProcedureFromProcedureSql)
        await exec(dropLocalTableProcedureSql)
        await exec(localTableProcNameSql)
        const promisedUserType = util.promisify(theConnection.getUserTypeTable)
        const table = await promisedUserType(tableTypeName)
        return table
      }
      function repeat (a, num) {
        return new Array(num + 1).join(a)
      }

      function getVec (descriptionLength) {
        const longString = repeat('a', descriptionLength)
        const v = [
          {
            description: longString,
            username: 'santa',
            age: 1000,
            salary: 0,
            code: 123456789012.345,
            start_date: new Date(1695, 11, 25)
          },
          {
            description: 'an entry',
            username: 'md',
            age: 28,
            salary: 100000,
            code: 98765432109876,
            start_date: new Date(2010, 1, 10)
          }
        ]
        v.forEach(e => {
          e.start_date.nanosecondsDelta = 0
        })
        return v
      }

      function getExtendedVec (descriptionLength) {
        const longString = repeat('-repeated-', descriptionLength)
        const v = [
          {
            description: longString,
            username: 'santa',
            age: 1000,
            salary: 0,
            code: 123456789012.345,
            start_date: new Date(1695, 11, 25)
          },
          {
            description: 'can compound Ã¢â‚¬',
            username: 'md',
            age: 28,
            salary: 100000,
            code: 98765432109876,
            start_date: new Date(2010, 1, 10)
          }
        ]
        v.forEach(e => {
          e.start_date.nanosecondsDelta = 0
        })
        return v
      }
      this.create = create
      this.getVec = getVec
      this.getExtendedVec = getExtendedVec
    }
  }

  test('use tvp simple test type insert test extended ascii', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getExtendedVec(8 * 1024)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp simple test type insert test long string 8 * 1024', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getVec(8 * 1024)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('call tvp proc with local table', testDone => {
    const tableName = 'TestTvp'
    const all = []
    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ],
      [
        {
          Column0: 'Select Complete'
        }
      ]
    ]
    let procedure
    expected[1][0].start_date.nanosecondsDelta = 0
    const helper = new TvpHelper(theConnection, tableName)
    const fns = [

      async asyncDone => {
        await helper.create(tableName)
        asyncDone()
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('localTableProcedure', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        procedure.call(['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)], (err, res, output, more) => {
          assert.ifError(err)
          all.push(res)
          if (!output) return
          assert.strictEqual(1, res.length)
          assert.deepStrictEqual(expected, all)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('call tvp proc from proc', testDone => {
    const tableName = 'TestTvp'
    const all = []
    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          Column0: 'Insert 2 Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        },
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ]
    ]
    let procedure
    expected[2][0].start_date.nanosecondsDelta = 0
    expected[2][1].start_date.nanosecondsDelta = 0
    const helper = new TvpHelper(theConnection, tableName)
    const fns = [

      async asyncDone => {
        await helper.create(tableName)
        asyncDone()
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('callProcedureFromProcedure', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        procedure.call(['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)], (err, res, output, more) => {
          assert.ifError(err)
          all.push(res)
          if (!output) return
          assert.strictEqual(2, res.length)
          assert.deepStrictEqual(expected, all)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp to select from table type complex object Employee type', testDone => {
    const tableName = 'employee'
    let bulkMgr

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, bulk => {
          bulkMgr = bulk
          asyncDone()
        })
      },

      asyncDone => {
        let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const sql = bulkMgr.asUserType()
        theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const parsedJSON = helper.getJSON()
        // construct a table type based on a table definition.
        const table = bulkMgr.asTableType()
        // convert a set of objects to rows
        table.addRowsFromObjects(parsedJSON)
        // use a type the native driver can understand, using column based bulk binding.
        const tp = sql.TvpFromTable(table)
        theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          helper.compareEmployee(res, parsedJSON)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('employee use tm to get a table value type representing table and create that user table type', testDone => {
    const tableName = 'employee'
    let bulkMgr

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, bulk => {
          bulkMgr = bulk
          asyncDone()
        })
      },

      asyncDone => {
        let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const sql = bulkMgr.asUserType()
        theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.getUserTypeTable('EmployeeType', (err, def) => {
          assert.ifError(err)
          const summary = bulkMgr.getSummary()
          assert(def.columns.length = summary.columns.length)
          const t = bulkMgr.asTableType()
          assert(t.columns.length === summary.columns.length)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp simple test type insert test using pm', testDone => {
    const tableName = 'TestTvp'
    let table
    let procedure
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('insertTestTvp', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(vec, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('non dbo schema use tvp simple test type select test', testDone => {
    const tableName = 'TestSchema.TestTvp'
    let table
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp simple test type select test', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp simple test type insert test', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = new TvpHelper(theConnection, tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(vec, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })
})
