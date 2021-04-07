'use strict'

/* global suite test setup */

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('warnings', function () {
  let connStr
  let theConnection
  let support
  let async
  let helper
  let driver
  let procedureHelper
  const sql = global.native_sql

  this.timeout(20000)

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      driver = co.driver
      const myRegexp = /Driver=\{(.*?)\}.*$/g
      const match = myRegexp.exec(connStr)
      driver = match[1]
      helper.setVerbose(false)
      sql.open(connStr, (err, conn) => {
        theConnection = conn
        assert(err === false)
        testDone()
      })
    }, global.conn_str)
  })

  const joinFailTestQry =
    'SELECT tmp. * ' +
    'FROM (' +
    ' SELECT 1 [id], \'test1\' [value]' +
    ' UNION ALL select 2, \'test2\'' +
    ') tmp ' +
    ' INNER MERGE JOIN (' +
    ' SELECT 1 [id2],\'jointest1\' [value2] ' +
    ' UNION ALL select 2, \'jointest2\'' +
    ') tmp2 ON tmp.id = tmp2.id2 ' +
    ' OPTION (RECOMPILE);'

  const nullEliminatedTestQry =
    'SELECT ' +
    ' SUM(tmp.[A])' +
    ' FROM ( ' +
    ' SELECT 1 [A], 2 [B], 3 [C] ' +
    ' UNION ALL SELECT NULL, 5, 6 ' +
    ' UNION ALL SELECT 7, NULL, NULL ' +
    ' ) as tmp ' +
    ' OPTION (RECOMPILE);'

  function testQry (qry, done) {
    const errors = []
    const warnings = []
    let meta
    const res = []
    let obj
    const stmt = theConnection.queryRaw(qry)
    stmt.on('meta', m => {
      meta = m
    })
    stmt.on('error', err => {
      errors.push(err)
    })
    stmt.on('info', err => {
      warnings.push(err)
    })
    stmt.on('column', (c, d) => {
      obj.push(d)
    })
    stmt.on('row', () => {
      obj = []
      res.push(obj)
    })
    stmt.on('done', () => {
      done(warnings, errors, meta, res)
    })
  }

  function testPrepared (qry, done) {
    const errors = []
    const warnings = []
    theConnection.prepare(qry, (e, ps) => {
      ps.preparedQuery([1], (err) => {
        if (err) {
          errors.push(err)
        }
        ps.free(() => {
          done(warnings, errors)
        })
      })
    })
  }

  function testSP (done) {
    const errors = []
    const warnings = []
    const pm = theConnection.procedureMgr()
    const sp = pm.callproc('tstWarning')

    sp.on('error', (err) => {
      errors.push(err)
      done(warnings, errors)
    })
    sp.on('info', (err) => {
      warnings.push(err)
      done(warnings, errors)
    })
  }

  /*
    testSP(connStr, 'TEST FIVE - Stord Proc - JOIN HINT WARNING')
    */

  test('TEST THREE - Prepared Query - JOIN HINT WARNING', testDone => {
    const fns = [
      asyncDone => {
        testPrepared(joinFailTestQry, (warnings, errors) => {
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('TEST ONE - Query - JOIN HINT WARNING', testDone => {
    const expected = [
      [
        1,
        'test1'
      ],
      [
        2,
        'test2'
      ]
    ]
    const fns = [
      asyncDone => {
        testQry(joinFailTestQry, (warnings, errors, meta, res) => {
          assert(meta)
          assert(meta.length === 2)
          assert(warnings.length === 1)
          assert(errors.length === 0)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('TEST TWO - Query - NULL ELIMNATED WARNING', testDone => {
    const expected = [
      [
        8
      ]
    ]
    const fns = [
      asyncDone => {
        testQry(nullEliminatedTestQry, (warnings, errors, meta, res) => {
          assert(warnings.length === 0)
          assert(errors.length === 0)
          assert(meta)
          assert.deepStrictEqual(res, expected)
          assert(meta.length === 1)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('TEST FIVE - Stord Proc - JOIN HINT WARNING', testDone => {
    const fns = [
      asyncDone => {
        testSP((warnings, errors) => {
          assert(errors.length === 1)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('print raises warning not error', testDone => {
    const fns = [
      asyncDone => {
        const warnings = []
        const err = new Error(`[Microsoft][${driver}][SQL Server]print error`)
        err.code = 0
        err.sqlstate = '01000'
        err.stack = null
        err.severity = 0
        err.procName = ''
        err.lineNumber = 1
        const expectedErrors = [err]
        const expectedResults = [
          {
            cnt: 1
          }
        ]
        const sql = 'print \'print error\'; select 1 as cnt'
        const q = theConnection.query(sql, [], (err, res, more) => {
          assert.ifError(err)
          if (!more) {
            assert(warnings.length === 1)
            assert(warnings[0].serverName.length > 0)
            delete warnings[0].serverName
            assert.deepStrictEqual(warnings, expectedErrors)
            assert.deepStrictEqual(res, expectedResults)
          }
        })
        q.on('error', err => {
          err.stack = null
          assert.ifError(err)
        })
        q.on('info', err => {
          warnings.push(err)
        })
        q.on('done', () => {
          asyncDone()
        })
      }]

    async.series(fns, () => {
      testDone()
    })
  })

  test('TEST FOUR - Prepared Query - NULL ELIMNATED WARNING', testDone => {
    const fns = [
      asyncDone => {
        testPrepared(nullEliminatedTestQry, (warnings, errors) => {
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })
})
