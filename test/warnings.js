'use strict'

/* globals describe it */

const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('warning', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
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

  async function testPreparedAsync (qry) {
    const ps = await env.theConnection.promises.prepare(qry)
    await ps.promises.query([1])
    await ps.promises.free()
  }

  function testSP (done) {
    const errors = []
    const warnings = []
    const pm = env.theConnection.procedureMgr()
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

  it('TEST THREE - Prepared Query - JOIN HINT WARNING', async function hander () {
    await testPreparedAsync(joinFailTestQry)
  })

  it('TEST ONE - Query - JOIN HINT WARNING', async function hander () {
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
    const res = await env.theConnection.promises.query(joinFailTestQry, [], { raw: true })
    expect(res.first).is.deep.equal(expected)
    expect(res.meta[0].length).is.equal(2)
    expect(res.info.length).is.equal(1)
  })

  it('TEST TWO - Query - NULL ELIMNATED WARNING', async function handler () {
    const expected = [
      [
        8
      ]
    ]
    const res = await env.theConnection.promises.query(nullEliminatedTestQry, [], { raw: true })
    expect(res.first).is.deep.equal(expected)
    expect(res.meta.length).is.equal(1)
    expect(res.info).is.equal(null)
  })

  it('TEST FIVE - Stord Proc - JOIN HINT WARNING', testDone => {
    const fns = [
      asyncDone => {
        testSP((warnings, errors) => {
          assert(errors.length === 1)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('print raises warning not error', testDone => {
    const fns = [
      asyncDone => {
        const warnings = []
        const msg = 'print error'
        const expectedResults = [
          {
            cnt: 1
          }
        ]
        const sql = `print '${msg}'; select 1 as cnt`
        const q = env.theConnection.query(sql, [], (err, res, more) => {
          assert.ifError(err)
          if (!more) {
            assert(warnings.length === 1)
            assert(warnings[0].serverName.length > 0)
            delete warnings[0].serverName
            warnings.forEach(w => {
              assert(w.message.includes(msg))
            })
            expect(res).to.deep.equal(expectedResults)
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('TEST FOUR - Prepared Query - NULL ELIMNATED WARNING', async function handler () {
    await testPreparedAsync(nullEliminatedTestQry)
  })
})
