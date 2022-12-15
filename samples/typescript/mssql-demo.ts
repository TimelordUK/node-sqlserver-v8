import {
  Connection, Error, PreparedStatement,
  Query, SqlClient, QueryDescription, BulkTableMgr, Meta
} from 'msnodesqlv8'

const sql: SqlClient = require('msnodesqlv8')
const supp = require('./demo-support')

/*
 This demo assumes a SQL server database is available.  Modify the connection string below
 appropriately.  Note, for testing sqllocaldb can be very useful - here a sql server
 database can be run from the command line.
 for example :-
 sqllocaldb create node
 sqllocaldb start node
 sqllocaldb info node
 */

// let test_conn_str = "Driver={SQL Server Native Client 11.0};Server= np:\\\\.\\pipe\\LOCALDB#8765A478\\tsql\\query;Database={scratch};Trusted_Connection=Yes;";

// if you have a sqllocaldb running with instance called "node" and db "scratch" then
// this will be used automatically.  To use another connection string for test
// uncomment below.

let connectionStr: string

const demos = [
  // open connection, simple query and close.
  connection,
  // prepared statements to repeat execute SQL with different params.
  prepared,
  // use the table manager to bind to a table and interact with it.
  table,
  // create and execute a stored procedure using pm.
  procedure,
  // query both ad hoc and via an open connection.
  query,
  // shows driver based events can be captured.
  event,
  // cancel a long running query
  cancel
]

interface Employee {
  BusinessEntityID: number
  NationalIDNumber: string
  LoginID: string
  OrganizationNode: any
  OrganizationLevel: number
  JobTitle: string
  BirthDate: Date
  MaritalStatus: string
  Gender: string
  HireDate: string
  SalariedFlag: boolean
  VacationHours: number
  SickLeaveHours: number
  CurrentFlag: boolean
  rowguid: string
  ModifiedDate: Date
}

let support: any = null
let procedureHelper: any = null
let helper: any = null
let parsedJSON: Employee[]

supp.GlobalConn.init(sql, (co: any) => {
  connectionStr = co.conn_str
  support = co.support
  procedureHelper = new support.ProcedureHelper(connectionStr)
  procedureHelper.setVerbose(false)
  const async = co.async
  helper = co.helper
  parsedJSON = helper.getJSON('../../test/json')

  console.log(connectionStr)
  async.series(demos, () => {
    console.log('demo has finished.')
  })
}
// to override an auto discovered sqllocaldb str assign above and uncomment below.
// , test_conn_str
)

function event (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()
  let conn: Connection

  const fns: Function[] = [

    function (asyncDone: Function) {
      console.log('event begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err: Error, connection: Connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('listen to the events raised from the driver')
      const s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'"
      console.log(s)
      const q = conn.query(s, (err: Error, res: any[]) => {
        Assert.ifError(err)
        console.log(`res.length = ${res.length}`)
        console.log(res)
        asyncDone()
      })

      q.on('meta', (meta: Meta[]) => {
        console.log(`event: meta[0].name = ${meta[0].name}`)
      })

      q.on('column', (col: number) => {
        console.log(`event: column = ${col}`)
      })

      q.on('submitted', (q: QueryDescription) => {
        console.log('event: submitted query = ' + JSON.stringify(q))
      })

      q.on('rowcount', (count: number) => {
        console.log(`event: rowcount ${count}`)
      })

      q.on('row', (row: number) => {
        console.log(`event: row = ${row}`)
      })

      q.on('done', () => {
        console.log('event: done')
      })

      q.on('open', () => {
        console.log('event: open')
      })

      q.on('closed', () => {
        console.log('event: open')
      })

      q.on('error', (err: Error) => {
        console.log(JSON.stringify(err))
      })

      q.on('warning', (err: Error) => {
        console.log(JSON.stringify(err))
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... event ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function query (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()

  let conn: Connection

  const fns = [

    function (asyncDone: Function) {
      console.log('query begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('execute an ad hoc query with temporary connection.')
      const q = 'declare @s NVARCHAR(MAX) = ?; select @s as s'
      sql.query(connectionStr, q, ['node is great'], (err, res) => {
        Assert.ifError(err)
        console.log(res)
        asyncDone()
      })
    },

    function (asyncDone: Function): void {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err, connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('use an open connection to call query()')
      const s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'"
      console.log(s)
      conn.query(s, (err, res) => {
        Assert.ifError(err)
        if (res != null) {
          console.log(`res.length = ${res.length}`)
          console.log(res)
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('use an open connection to call queryRaw()')
      const s = "select top 1 id, name, type, crdate from sysobjects so where so.type='U'"
      console.log(s)
      conn.queryRaw(s, (err, res) => {
        Assert.ifError(err)
        if (res != null) {
          console.log(`res.length = ${res.rows.length}`)
          console.log(res)
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('use timeout to place limit on how long to wait for query.')
      const queryObj: QueryDescription = {
        query_str: `waitfor delay ${'00:00:10'}`,
        query_timeout: 2
      }

      conn.query(queryObj, (err: any) => {
        Assert.check(err != null)
        Assert.check(err.message.indexOf('Query timeout expired') > 0)
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... query ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function procedure (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()

  let conn: Connection

  const spName = 'test_sp_get_int_int'
  let def = 'alter PROCEDURE <name>' +
        '(\n' +
        '@num1 INT,\n' +
        '@num2 INT,\n' +
        '@num3 INT OUTPUT\n' +
        '\n)' +
        'AS\n' +
        'BEGIN\n' +
        '   SET @num3 = @num1 + @num2\n' +
        '   RETURN 99;\n' +
        'END\n'

  const fns: Array<(asyncDone: Function) => any> = [

    function (asyncDone: Function) {
      console.log('procedure begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err, connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      def = def.replace(/<name>/g, spName)
      console.log('create a procedure ' + spName)
      console.log(def)
      procedureHelper.createProcedure(spName, def, () => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      const pm = conn.procedureMgr()
      pm.callproc(spName, [10, 5], (err: Error, results: any, output: any[]) => {
        Assert.ifError(err)
        const expected = [99, 15]
        console.log(output)
        Assert.check(expected[0] === output[0], "results didn't match")
        Assert.check(expected[1] === output[1], "results didn't match")
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      const pm = conn.procedureMgr()
      console.log('describe procedure.')
      pm.describe(spName, summary => {
        const s = JSON.stringify(summary, null, 2)
        console.log(s)
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... procedure ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function connection (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()

  let conn: Connection

  const fns = [

    function (asyncDone: Function) {
      console.log('connection begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err, connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('fetch spid for the connection.')
      conn.query('select @@SPID as id, CURRENT_USER as name', (err, res) => {
        Assert.ifError(err)

        if (res != null) {
          Assert.check(res.length === 1, 'unexpected result length.')
          const sp = res[0].id
          Assert.check(sp != null, 'did not find expected id.')
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... connection ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function empSelectSQL (): string {
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
     WHERE BusinessEntityID = ?`
}

function empDeleteSQL (): string {
  return `DELETE FROM [scratch].[dbo].[Employee]
        WHERE BusinessEntityID = ?`
}

class Statements {
  constructor (public selectStatement?: PreparedStatement, public deleteStatement?: PreparedStatement) {
  }
}

function prepared (done: Function): void {
// create and populate table - fetch prepared statements to select and free records for employee table.
  // use the prepared statements to select and free rows.
  // free the statements and indicate this part of the demo has finished.

  const async = new support.Async()
  const Assert = new support.Assert()

  function statementsFactory (): Statements {
    return new Statements()
  }

  const statements: Statements = statementsFactory()

  const employeeTableName = 'Employee'

  let conn: Connection

  function employeePrepare (query: string, done: Function): void {
    conn.prepare(query, (err, ps) => {
      Assert.ifError(err)
      done(ps)
    })
  }

  const fns = [

    function (asyncDone: Function) {
      console.log('prepared begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err, connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    // drop / create an Employee table.
    function (asyncDone: Function) {
      helper.dropCreateTable({
        tableName: employeeTableName
      }, function () {
        asyncDone()
      })
    },

    // insert test set using bulk insert
    function (asyncDone: Function) {
      const tm = conn.tableMgr()
      tm.bind(employeeTableName, (bulkMgr: BulkTableMgr) => {
        bulkMgr.insertRows(parsedJSON, () => {
          asyncDone()
        })
      })
    },

    // prepare a select statement.
    function (asyncDone: Function) {
      console.log('preparing a select statement.')
      employeePrepare(empSelectSQL(), (ps: PreparedStatement) => {
        statements.selectStatement = ps
        asyncDone()
      })
    },

    // prepare a free statement.
    function (asyncDone: Function) {
      console.log('preparing a free statement.')
      employeePrepare(empDeleteSQL(), (ps: PreparedStatement) => {
        statements.deleteStatement = ps
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('check statements.')
      Assert.check(statements != null, 'prepared statement object is null.')
      Assert.check(statements.selectStatement != null, 'prepared select is null')
      Assert.check(statements.deleteStatement != null, 'prepared free is null')
      asyncDone()
    },

    function (asyncDone: Function) {
      const id = 1
      console.log(`use prepared statement to fetch ${id}`)
      if (statements.selectStatement != null) {
        statements.selectStatement.preparedQuery([id], (err, res) => {
          Assert.ifError(err)
          if (res != null) {
            Assert.check(res.length === 1)
            console.log(res[0])
          }
          asyncDone()
        })
      }
    },

    function (asyncDone: Function) {
      const id = 2
      console.log(`use prepared statement to fetch ${id}`)
      if (statements.selectStatement != null) {
        statements.selectStatement.preparedQuery([id], (err, res) => {
          Assert.ifError(err)
          if (res != null) {
            Assert.check(res.length === 1)
            console.log(res[0])
          }
          asyncDone()
        })
      }
    },

    function (asyncDone: Function) {
      const id = 5
      console.log(`use prepared statement to free ${id}`)
      if (statements.deleteStatement != null) {
        statements.deleteStatement.preparedQuery([id], err => {
          Assert.ifError(err)
          asyncDone()
        })
      }
    },

    function (asyncDone: Function) {
      console.log('check how many rows are left.')
      conn.query('select * from Employee', (err, res) => {
        Assert.ifError(err)

        if (res != null) {
          console.log(`returned rows ${res.length}`)
          Assert.check(res.length === 9, 'one row should have been deleted.')
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('free statements')
      if (statements.selectStatement != null) {
        statements.selectStatement.free()
      }
      if (statements.deleteStatement != null) {
        statements.deleteStatement.free()
      }
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... prepared ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function table (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()
  const helper = new support.EmployeeHelper(sql, connectionStr)
  let conn: Connection
  const employeeTableName = 'Employee'
  let bm: BulkTableMgr
  const records: Employee[] = helper.getJSON()

  const fns = [

    function (asyncDone: Function) {
      console.log('table begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err, connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn != null, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('create an employee table.')
      helper.dropCreateTable({
        tableName: employeeTableName
      }, function () {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      const tm = conn.tableMgr()
      console.log('bind to table ' + employeeTableName)
      tm.bind(employeeTableName, (bulk: BulkTableMgr) => {
        bm = bulk
        Assert.check(bm, 'no bulk manager returned.')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('bulk insert records.')
      bm.insertRows(records, () => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('check rows have been inserted.')
      conn.query('select * from ' + employeeTableName, (err, res) => {
        Assert.ifError(err)

        if (res != null) {
          Assert.check(res.length === records.length)
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('update a column.')
      const newDate = new Date('2015-01-01T00:00:00.000Z')
      const modifications: any[] = []
      records.forEach((emp: Employee) => {
        emp.ModifiedDate = newDate
        modifications.push({
          BusinessEntityID: emp.BusinessEntityID,
          ModifiedDate: newDate
        })
      })

      const updateCols = [
        {
          name: 'ModifiedDate'
        }
      ]

      bm.setUpdateCols(updateCols)
      bm.updateRows(modifications, () => {
        asyncDone()
      })
    },

    // use the select signature to construct a prepared query.

    function (asyncDone: Function) {
      const summary = bm.getSummary()
      const s = JSON.stringify(summary, null, 2)
      console.log(s)
      console.log(summary.selectSignature)
      console.log('prepare the above statement.')
      const select: string = summary.selectSignature
      conn.prepare(select, (err: Error, ps: PreparedStatement) => {
        Assert.ifError(err)
        ps.preparedQuery([1], (err, res) => {
          Assert.ifError(err)

          if (res != null) {
            Assert.check(res.length === 1)
          }

          asyncDone()
        })
      })
    },

    function (asyncDone: Function) {
      console.log('free the records using bulk operation.')
      const keys = helper.extractKey(records, 'BusinessEntityID')
      bm.deleteRows(keys, () => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('check rows have been deleted.')
      conn.query('select * from ' + employeeTableName, (err, res) => {
        Assert.ifError(err)

        if (res != null) {
          Assert.check(res.length === 0)
        }

        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... table ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}

function cancel (done: Function): void {
  const async = new support.Async()
  const Assert = new support.Assert()
  let conn: Connection

  const fns: Function[] = [

    function (asyncDone: Function) {
      console.log('cancel begins ...... ')
      asyncDone()
    },

    function (asyncDone: Function) {
      console.log('opening a connection ....')
      sql.open(connectionStr, (err: Error, connection: Connection) => {
        Assert.ifError(err)
        conn = connection
        Assert.check(conn, 'connection from open is null.')
        console.log('... open')
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('use an open connection to call query(), then cancel it')
      const q: Query = conn.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), err => {
        if (err != null) {
          Assert.check(err.message.indexOf('Operation canceled') > 0)
        }

        asyncDone()
      })

      conn.cancelQuery(q, err => {
        Assert.ifError(err)
      })
    },

    function (asyncDone: Function) {
      console.log('cancel using query identifier.')
      const q: Query = conn.query(sql.PollingQuery('waitfor delay \'00:00:20\''), function (err) {
        if (err != null) {
          Assert.check(err.message.indexOf('Operation canceled') > 0)
        }

        asyncDone()
      })

      q.cancelQuery(err => {
        Assert.ifError(err)
      })
    },

    function (asyncDone: Function) {
      console.log('cancel a prepared statement.')
      const s = 'waitfor delay ?;'
      let prepared: PreparedStatement

      const fns: Function[] = [
        function (asyncDone: Function) {
          conn.prepare(sql.PollingQuery(s), (err: Error, pq: PreparedStatement) => {
            Assert.ifError(err)
            prepared = pq
            asyncDone()
          })
        },

        function (asyncDone: Function) {
          const q: Query = prepared.preparedQuery(['00:00:20'], (err: Error) => {
            Assert.check(err.message.indexOf('Operation canceled') > 0)
            asyncDone()
          })

          q.on('submitted', function () {
            q.cancelQuery((e: Error) => {
              Assert.ifError(e)
            })
          })
        }
      ]

      async.series(fns, () => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('cancel a stored proc.')

      const spWaitForName = 'test_spwait_for'

      const def = 'alter PROCEDURE <name>' +
                '(\n' +
                '@timeout datetime' +
                '\n)' +
                'AS\n' +
                'BEGIN\n' +
                'waitfor delay @timeout;' +
                'END\n'

      const fns: Function[] = [
        function (asyncDone: Function) {
          procedureHelper.createProcedure(spWaitForName, def, function () {
            asyncDone()
          })
        },

        function (asyncDone: Function) {
          const pm = conn.procedureMgr()
          pm.setPolling(true)
          const q: Query = pm.callproc(spWaitForName, ['0:0:20'], function (err) {
            Assert.check(err)

            if (err != null) {
              Assert.check(err.message.indexOf('Operation canceled') > 0)
            }

            asyncDone()
          })
          q.on('submitted', function () {
            q.cancelQuery(function (err) {
              Assert.check(err == null)
            })
          })
        }
      ]

      async.series(fns, function () {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('close connection.')
      conn.close(() => {
        asyncDone()
      })
    },

    function (asyncDone: Function) {
      console.log('...... cancel ends.')
      asyncDone()
    }
  ]

  console.log('executing async set of functions .....')
  async.series(fns, () => {
    console.log('..... async completes. \n\n\n\n\n\n')
    done()
  })
}
