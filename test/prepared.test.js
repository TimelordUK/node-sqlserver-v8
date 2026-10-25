'use strict'

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const assert = chai.assert
const expect = chai.expect

// Enable trace-level logging for debugging test failures
const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

describe('prepared', function () {
  const tableName = 'employee'

  let theConnection
  let prepared
  let parsedJSON

  this.timeout(100 * 1000)

  async function bootup () {
    parsedJSON = env.helper.getJSON()
    theConnection = env.theConnection
    await env.promisedDropCreateTable({
      tableName
    })
    const bulkMgr = await theConnection.promises.getTable(tableName)
    await bulkMgr.promises.insert(parsedJSON)
    prepared = await env.employee.prepare()
  }

  this.beforeEach(async function handler () {
    await env.open()
    prepared = {
      update: null,
      select: null,
      delete: null,
      scan: null
    }
    await bootup()
  })

  this.afterEach(done => {
    env.employee.free(prepared)
      .then(async () => env.close())
      .then(() => { done() }).catch((err) => { done(err) })
  })

  it('use prepared statement with params returning 0 rows. - expect no error', async function handler () {
    const select = prepared.select
    const meta = select.getMeta()
    const id1 = -1

    assert.isTrue(meta.length > 0)
    const res = await select.promises.query([id1])
    assert(res != null)
    assert.deepStrictEqual(res.first.length, 0)
  })

  describe('default max prepared size', () => {
    it('use prepared and select nvarchar max with max default size on connection', async function handler () {
      if (env.isEncryptedConnection()) return
      const s = 'hello'
      const max = 4
      const q = `DECLARE @v NVARCHAR(MAX) = '${s}'; SELECT @v AS v`
      env.theConnection.setMaxPreparedColumnSize(max)
      const prepared = await env.theConnection.promises.prepare(q)
      const res = await prepared.promises.query([])
      assert.deepStrictEqual(res.first[0].v, s.slice(0, 4))
      await prepared.promises.free()
    })

    it('use prepared and select nvarchar max with max default size on query', async function handler () {
      if (env.isEncryptedConnection()) return
      const s = 'hello'
      const max = 4
      const q = {
        query_str: `DECLARE @v NVARCHAR(MAX) = '${s}'; SELECT @v AS v`,
        max_prepared_column_size: max
      }
      const prepared = await env.theConnection.promises.prepare(q)
      const res = await prepared.promises.query([])
      assert.deepStrictEqual(res.first[0].v, s.slice(0, 4))
      await prepared.promises.free()
    })
  })

  it('use prepared and select nvarchar(max)', async function handler () {
    if (env.isEncryptedConnection()) return
    const s = 'hello'
    const q = `DECLARE @v NVARCHAR(MAX) = '${s}'; SELECT @v AS v`
    const prepared = await env.theConnection.promises.prepare(q)
    const res = await prepared.promises.query([])
    assert.deepStrictEqual(res.first[0].v, s)
    await prepared.promises.free()
  })

  it('use prepared to reserve and read multiple rows.', async function handler () {
    const sql = 'select top 5 * from master..syscomments'
    const pq = await theConnection.promises.prepare(sql)
    const res = await pq.promises.query([])
    assert(res != null)
    assert(res.first.length > 0)
    await pq.promises.free()
  })

  it('use prepared to select 0 rows - expect no error (await promise)', async function handler () {
    const sql = 'select * from master..syscomments where 1=0'
    const preparedQuery = await theConnection.promises.prepare(sql)
    const results = await preparedQuery.promises.query([])
    assert(results != null)
    assert(results.first.length === 0)
    await preparedQuery.promises.free()
    return null
  })

  it('use prepared to select 0 rows - expect no error (promise then)', testDone => {
    const sql = 'select * from master..syscomments where 1=0'
    theConnection.promises.prepare(sql)
      .then(preparedQuery => {
        preparedQuery.promises.query([])
          .then(results => {
            assert(results != null)
            assert(results.first.length === 0)
            preparedQuery.promises.free()
              .then(() => {
                testDone()
              }).catch(err => {
                testDone(err)
              })
          }).catch(err => {
            testDone(err)
          })
      }).catch(err => {
        testDone(err)
      })
  })

  it('use prepared statement with params updating 0 rows - expect no error', async function handler () {
    const update = prepared.update
    const meta = update.getMeta()
    const id1 = -1

    assert(meta.length === 0)
    await update.promises.query(['login1', id1])
  })

  it('use prepared statement twice with no parameters.', testDone => {
    const select = prepared.scan
    const meta = select.getMeta()
    assert(meta.length > 0)
    select.preparedQuery((err, res1) => {
      assert.ifError(err)
      assert.deepStrictEqual(parsedJSON, res1, 'results didn\'t match')
      select.preparedQuery((err, res2) => {
        assert.ifError(err)
        assert.deepStrictEqual(parsedJSON, res2, 'results didn\'t match')
        testDone()
      })
    })
  })

  it('use prepared statements to select a row, then delete it over each row.', testDone => {
    const select = prepared.select
    const meta = select.getMeta()
    assert(meta.length > 0)
    const remove = prepared.delete
    const max = parsedJSON[parsedJSON.length - 1].BusinessEntityID
    let businessId = 1
    next(businessId, iterate)

    function iterate () {
      businessId++
      if (businessId > max) check()
      else next(businessId, iterate)
    }

    function check () {
      theConnection.query('select count(*) as rows from Employee', (err, res) => {
        assert.ifError(err)
        assert(res[0].rows === 0)
        testDone()
      })
    }

    function next (businessId, done) {
      select.preparedQuery([businessId], (err, res1) => {
        assert.ifError(err)
        const fetched = parsedJSON[businessId - 1]
        assert.deepStrictEqual(fetched, res1[0], 'results didn\'t match')
        remove.preparedQuery([businessId], (err) => {
          assert.ifError(err)
          done()
        })
      })
    }
  })

  it('stress test prepared statement with 500 invocations cycling through primary key', async function handler () {
    const select = prepared.select
    const meta = select.getMeta()
    assert(meta.length > 0)
    const totalIterations = 500
    const max = parsedJSON[parsedJSON.length - 1].BusinessEntityID

    for (let i = 0; i < totalIterations; ++i) {
      const businessId = i % max + 1
      const res = await select.promises.query([businessId])
      expect(res.first[0]).to.deep.equal(parsedJSON[businessId - 1])
    }
  })

  it('use prepared statement twice with different params.', async function handler () {
    const select = prepared.select
    const meta = select.getMeta()
    const id1 = 2
    const id2 = 3
    assert(meta.length > 0)
    const res1 = await select.promises.query([id1])
    const res2 = await select.promises.query([id2])
    const o1 = parsedJSON[id1 - 1]
    const o2 = parsedJSON[id2 - 1]
    expect(res1.first[0]).to.deep.equal(o1)
    expect(res2.first[0]).to.deep.equal(o2)
  })
  // with column encryption enabled the driver checks nothing at prepare (a syntax error is
  // reported at execute), and describes no result: the tests that need a plain prepare run
  // on a connection without it
  const plainConnectionString = () => env.connectionString.replace(/ColumnEncryption=Enabled;?/i, '')
  const encryptedConnectionString = () => /ColumnEncryption=Enabled/i.test(env.connectionString)
    ? env.connectionString
    : `${env.connectionString.replace(/;?$/, ';')}ColumnEncryption=Enabled`

  // a prepare that failed gave a statement all the same, and executing it crashed the
  // process: it had no storage for its result
  describe('a prepare that fails', function () {
    const unpreparable = 'selec ? as n'
    let conn

    this.beforeEach(async function () {
      conn = await sql.promises.open(plainConnectionString())
    })

    this.afterEach(async function () {
      await conn.promises.close()
    })

    it('calls back with the error and no statement', async function handler () {
      const { err, ps } = await new Promise(resolve => {
        conn.prepare(unpreparable, (err, ps) => resolve({ err, ps }))
      })
      assert(err, 'expected the prepare to fail')
      const first = Array.isArray(err) ? err[0] : err
      expect(first.code).to.equal(156)
      assert.isNull(ps)
      const rows = await conn.promises.query('select 1 as n')
      assert.deepStrictEqual(rows.first, [{ n: 1 }])
    })

    it('rejects the promise', async function handler () {
      let err = null
      try {
        await conn.promises.prepare(unpreparable)
      } catch (e) {
        err = e
      }
      assert(err, 'expected the prepare to fail')
    })

    it('leaves the connection able to prepare again', async function handler () {
      await new Promise(resolve => conn.prepare(unpreparable, () => resolve()))
      const ps = await conn.promises.prepare('select cast(? as int) * 10 as n')
      const res = await ps.promises.query([2])
      assert.deepStrictEqual(res.first, [{ n: 20 }])
      await ps.promises.free()
    })

    it('the native statement refuses to execute (HY010), not crash', async function handler () {
      const { utilModule } = require('../lib/util')
      const native = new (new utilModule.Native().cppDriver.Connection)()
      await new Promise((resolve, reject) => native.open(plainConnectionString(), 10, e => e ? reject(e) : resolve()))
      try {
        const queryId = 1
        const prepared = await new Promise(resolve => {
          native.prepare(queryId, { query_str: unpreparable }, (err, meta) => resolve({ err, meta }))
        })
        assert(prepared.err, 'expected the prepare to fail')
        const executed = await new Promise(resolve => {
          native.bindQuery(queryId, [1], (err, meta) => resolve({ err, meta }))
        })
        const err = Array.isArray(executed.err) ? executed.err[0] : executed.err
        assert(err, 'expected the execution to be refused')
        expect(err.sqlstate).to.equal('HY010')
        await new Promise(resolve => native.releaseStatement(queryId, prepared.meta?.handle, () => resolve()))
      } finally {
        await new Promise(resolve => native.close(() => resolve()))
      }
    })
  })

  // the server cannot always say what a statement returns before it runs: 11521 when a
  // parameter decides a column's type, 11525 for a temp table in a batch, and with column
  // encryption enabled the driver describes nothing at prepare. such a statement prepares,
  // and each execution describes and binds what it returns
  for (const [mode, connectionString] of [['plain', plainConnectionString], ['column encryption', encryptedConnectionString]]) {
    describe(`a result described at execute (${mode})`, function () {
      let conn

      this.beforeEach(async function () {
        conn = await sql.promises.open(connectionString())
        // dropped first: on Linux a new connection can still have the last one's temp tables
        await conn.promises.query('drop table if exists #pd; create table #pd (id int); insert #pd values (1), (2)')
      })

      this.afterEach(async function () {
        await conn.promises.close()
      })

      async function execute (ps, params) {
        return new Promise((resolve, reject) => {
          const results = []
          ps.preparedQuery(params, (err, rows, more) => {
            if (err) return reject(err)
            results.push(rows)
            if (!more) resolve(results)
          })
        })
      }

      it('a parameter that decides the column type, by each execution', async function handler () {
        const ps = await conn.promises.prepare('select ? as n')
        assert.deepStrictEqual(await execute(ps, [2]), [[{ n: 2 }]])
        assert.deepStrictEqual(await execute(ps, ['abc']), [[{ n: 'abc' }]])
        assert.deepStrictEqual(await execute(ps, [1.5]), [[{ n: 1.5 }]])
        await ps.promises.free()
      })

      it('an expression over a parameter returns its rows', async function handler () {
        const ps = await conn.promises.prepare('select cast(? as int) * 10 as n')
        assert.deepStrictEqual(await execute(ps, [2]), [[{ n: 20 }]])
        assert.deepStrictEqual(await execute(ps, [3]), [[{ n: 30 }]])
        await ps.promises.free()
      })

      it('a temp table in a batch: the result after an insert', async function handler () {
        const ps = await conn.promises.prepare('insert #pd values (?); select count(*) as c from #pd')
        assert.deepStrictEqual(await execute(ps, [7]), [[], [{ c: 3 }]])
        assert.deepStrictEqual(await execute(ps, [8]), [[], [{ c: 4 }]])
        await ps.promises.free()
      })

      it('results of different types, read by their own columns, execution after execution', async function handler () {
        const ps = await conn.promises.prepare("select id from #pd where id = ?; select 'x' as b, 2.5 as d")
        const expected = [[{ id: 1 }], [{ b: 'x', d: 2.5 }]]
        assert.deepStrictEqual(await execute(ps, [1]), expected)
        assert.deepStrictEqual(await execute(ps, [1]), expected)
        await ps.promises.free()
      })
    })
  }
})
