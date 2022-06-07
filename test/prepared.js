//  ---------------------------------------------------------------------------------------------------------------------------------
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
//  ---------------------------------------------------------------------------------------------------------------------------------

'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('prepared', function () {
  const tableName = 'employee'

  let theConnection
  let prepared
  let parsedJSON

  this.timeout(100 * 1000)

  const actions = [
    // open a connection.
    async asyncDone => {
      theConnection = env.theConnection
      asyncDone()
    },

    // drop / create an Employee table.
    asyncDone => {
      env.helper.dropCreateTable({
        tableName
      }, () => {
        asyncDone()
      })
    },

    // insert test set using bulk insert
    async asyncDone => {
      const bulkMgr = await theConnection.promises.getTable(tableName)
      await bulkMgr.promises.insert(parsedJSON)
      asyncDone()
    },

    // prepare a select statement.
    async asyncDone => {
      prepared = await env.employee.prepare()
      asyncDone()
    }
  ]

  this.beforeEach(done => {
    env.open().then(() => {
      prepared = {
        update: null,
        select: null,
        delete: null,
        scan: null
      }
      parsedJSON = env.helper.getJSON()
      env.async.series(actions,
        () => {
          done()
        })
    })
  })

  this.afterEach(done => {
    env.employee.free(prepared)
      .then(() => env.close())
      .then(() => done())
  })

  it('use prepared and select nvarchar(max)', async function handler () {
    const s = 'hello'
    const q = `DECLARE @v NVARCHAR(MAX) = '${s}'; SELECT @v AS v`
    const prepared = await env.theConnection.promises.prepare(q)
    const res = await prepared.promises.query([])
    assert.deepStrictEqual(res.first[0].v, s)
    await prepared.free()
  })

  it('use prepared to reserve and read multiple rows.', async function handler () {
    const sql = 'select top 5 * from master..syscomments'
    const pq = await theConnection.promises.prepare(sql)
    const res = await pq.promises.query([])
    assert(res != null)
    assert(res.first.length > 0)
    await pq.free()
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

  it('use prepared statement with params returning 0 rows. - expect no error', testDone => {
    const select = prepared.select
    const meta = select.getMeta()
    const id1 = -1

    assert(meta.length > 0)
    select.preparedQuery([id1], (err, res) => {
      assert(res != null)
      assert(res.length === 0)
      assert.ifError(err)
      testDone()
    })
  })

  it('use prepared statement with params updating 0 rows - expect no error', testDone => {
    const update = prepared.update
    const meta = update.getMeta()
    const id1 = -1

    assert(meta.length === 0)
    update.preparedQuery(['login1', id1], (err, res) => {
      assert.ifError(err)
      assert(res != null)
      assert(res.length === 0)
      testDone()
    })
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

  it('stress test prepared statement with 500 invocations cycling through primary key', testDone => {
    const select = prepared.select
    const meta = select.getMeta()
    assert(meta.length > 0)
    let businessId = 1
    let iteration = 0
    const totalIterations = 500
    const max = parsedJSON[parsedJSON.length - 1].BusinessEntityID
    next(businessId, iterate)

    function iterate () {
      businessId++
      if (businessId > max) businessId = 1
      ++iteration
      if (iteration < totalIterations) {
        next(businessId, iterate)
      } else {
        testDone()
      }
    }

    function next (businessId, done) {
      select.preparedQuery([businessId],
        (err, res1) => {
          assert.ifError(err)
          assert(res1[0].BusinessEntityID === businessId)
          done()
        })
    }
  })

  it('use prepared statement twice with different params.', testDone => {
    const select = prepared.select
    const meta = select.getMeta()
    const id1 = 2
    const id2 = 3
    assert(meta.length > 0)
    select.preparedQuery([id1], (err, res1) => {
      assert.ifError(err)
      select.preparedQuery([id2], (err, res2) => {
        assert.ifError(err)
        const o1 = parsedJSON[id1 - 1]
        assert.deepStrictEqual(o1, res1[0], 'results didn\'t match')

        const o2 = parsedJSON[id2 - 1]
        assert.deepStrictEqual(o2, res2[0], 'results didn\'t match')
        testDone()
      })
    })
  })
})
