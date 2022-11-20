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

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
chai.use(require('chai-as-promised'))

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
      .then(() => env.close())
      .then(() => done())
  })

  it('use prepared and select nvarchar(max)', async function handler () {
    const s = 'hello'
    const q = `DECLARE @v NVARCHAR(MAX) = '${s}'; SELECT @v AS v`
    const prepared = await env.theConnection.promises.prepare(q)
    const res = await prepared.promises.query([])
    assert.deepStrictEqual(res.first[0].v, s)
    await prepared.promises.free()
  })

  it('use prepared and select nvarchar max with max default size on connection', async function handler () {
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

  it('use prepared statement with params returning 0 rows. - expect no error', async function handler () {
    const select = prepared.select
    const meta = select.getMeta()
    const id1 = -1

    assert(meta.length > 0)
    const res = await select.promises.query([id1])
    assert(res != null)
    assert.deepStrictEqual(res.first.length, 0)
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
})
