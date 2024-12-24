//  ---------------------------------------------------------------------------------------------------------------------------------
// File: query.js
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

const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('query', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => { done() })
  })

  this.afterEach(done => {
    env.close().then(() => { done() })
  })

  it('simple query with a promise open-query-close-resolve var%', async function handler () {
    const like = 'var%'
    const results = await env.sql.promises.query(env.connectionString, 'SELECT name FROM sys.types WHERE name LIKE ?', [like])
    for (let row = 0; row < results.first.length; ++row) {
      assert(results.first[row].name.substring(0, 3) === 'var')
    }
    return null
  })

  it('test retrieving a string with null embedded', async function handler () {
    const embeddedNull = String.fromCharCode(65, 66, 67, 68, 0, 69, 70)
    const tableName = 'null_in_string_test'
    const promises = env.theConnection.promises
    await promises.query(env.dropTableSql(tableName))
    await promises.query(`CREATE TABLE ${tableName} (id int IDENTITY, null_in_string varchar(100) NOT NULL)`)
    await promises.query(env.dropIndexSql(tableName))
    await promises.query(`CREATE CLUSTERED INDEX ix_${tableName} ON ${tableName} (id)`)
    await promises.query(`INSERT INTO ${tableName} (null_in_string) VALUES (?)`, [embeddedNull])
    const res = await promises.query(`SELECT null_in_string FROM ${tableName}`, [], { raw: true })
    expect(res.first[0][0]).is.equal(embeddedNull)
  })

  it('test retrieving a large decimal as a string 2', async function handler () {
    const precision = 21
    const scale = 7
    const numString = '1234567891011.1213141'
    const tableName = 'TestLargeDecimal'
    const promises = env.theConnection.promises
    await promises.query(env.dropTableSql(tableName))
    await promises.query(`CREATE TABLE ${tableName} (
          id VARCHAR(12) NOT NULL,
          testfield DECIMAL(${precision},${scale}) NOT NULL,
          PRIMARY KEY (id)
          )`)
    await promises.query(`INSERT INTO [dbo].[${tableName}] (id, testfield) VALUES (1, ${numString})`)
    const res = await promises.query(`select id, cast(testfield as varchar(${numString.length})) as big_d_as_s from ${tableName}`, [], { raw: true })
    expect(res.first[0][1]).is.equal(numString)
  })

  it('multiple results from query in callback', done => {
    let moreShouldBe = true
    let called = 0
    let buffer
    let expected

    env.theConnection.queryRaw('SELECT 1 as X, \'ABC\', 0x0123456789abcdef; SELECT 2 AS Y, \'DEF\', 0xfedcba9876543210',
      function (err, results, more) {
        assert.ifError(err)
        assert.strictEqual(more, moreShouldBe)
        ++called

        if (more) {
          buffer = Buffer.from('0123456789abcdef', 'hex')
          expected = {
            meta: [{ name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int' },
              { name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar' },
              { name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary' }],
            rows: [[1, 'ABC', buffer]]
          }

          assert.deepStrictEqual(results, expected, 'Result 1 does not match expected')

          assert(called === 1)
          moreShouldBe = false
        } else {
          buffer = Buffer.from('fedcba9876543210', 'hex')
          expected = {
            meta: [{ name: 'Y', size: 10, nullable: false, type: 'number', sqlType: 'int' },
              { name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar' },
              { name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary' }],
            rows: [[2, 'DEF', buffer]]
          }

          assert.deepStrictEqual(results, expected, 'Result 2 does not match expected')
          assert(called === 2)
          done()
        }
      })
  })

  it('verify empty results retrieved properly 2', async function handler () {
    const tableName = 'test_sql_no_data'
    const promises = env.theConnection.promises
    await promises.query(env.dropTableSql(tableName))
    await promises.query(`create table ${tableName} (id int identity, name varchar(20))`)
    await promises.query(env.dropIndexSql(tableName))
    await promises.query(`CREATE CLUSTERED INDEX ix_${tableName} ON ${tableName} (id)`)
    const res = await promises.query(`delete from ${tableName} where 1=0`, [], { raw: true })
    expect(res.meta.length).is.equals(0)
    expect(res.counts.length).is.equals(1)
    expect(res.counts[0]).is.equals(0)
  })

  it('object_name query ', async function handler () {
    const results = await env.theConnection.promises.query(
      'select object_name(c.object_id), (select dc.definition from sys.default_constraints as dc where dc.object_id = c.default_object_id) as DefaultValueExpression from sys.columns as c')
    expect(results.first.length).is.greaterThan(0)
  })

  it('select nulls union all nulls', async function handler () {
    const nullObj = {
      testdate: null,
      testint: null,
      testchar: null,
      testbit: null,
      testdecimal: null,
      testbinary: null,
      testtime: null
    }
    const expected = [nullObj, nullObj, nullObj]
    const results = await env.theConnection.promises.query('select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime\n' +
      'union all\n' +
      'select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime\n' +
      'union all\n' +
      'select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime')

    expect(results.first.length).is.equal(3)
    expect(results.first).is.deep.equal(expected)
  })

  it('test function parameter validation', async function handler () {
    // test the module level open, query and queryRaw functions

    function f0 () {
      env.sql.query(env.connectionString, () => {
        return 5
      })
    }

    function f1 () {
      env.sql.query(env.connectionString, ['This', 'is', 'a', 'test'])
    }

    function f2 () {
      env.sql.queryRaw(['This', 'is', 'a', 'test'], 'SELECT 1')
    }

    function f3 () {
      env.sql.open(env.connectionString, 5)
    }

    function f4 () {
      env.sql.open(1, 'SELECT 1')
    }

    function f5 () {
      env.sql.query(() => {
        return 1
      }, 'SELECT 1')
    }

    function f6 () {
      env.sql.queryRaw(env.connectionString, 'SELECT 1', 1)
    }

    function f7 () {
      env.sql.queryRaw(env.connectionString, 'SELECT 1', { a: 1, b: '2' }, () => {
      })
    }

    function f8 () {
      env.theConnection.query(1)
    }

    function f9 () {
      env.theConnection.queryRaw(() => {
        return 1
      })
    }

    expect(f0).to.throw('[msnodesql] Invalid query string passed to function query. Type should be string.')
    expect(f1).to.throw('[msnodesql] Invalid query string passed to function query. Type should be string.')
    expect(f2).to.throw('[msnodesql] Invalid connection string passed to function queryRaw. Type should be string.')
    expect(f3).to.throw('[msnodesql] Invalid callback passed to function open. Type should be function.')
    expect(f4).to.throw('[msnodesql] Invalid connection string passed to function open. Type should be string.')
    expect(f4).to.throw('[msnodesql] Invalid connection string passed to function open. Type should be string.')
    expect(f5).to.throw('[msnodesql] Invalid connection string passed to function query. Type should be string.')
    expect(f6).to.throw('[msnodesql] Invalid parameter(s) passed to function query or queryRaw.')
    expect(f7).to.throw('[msnodesql] Invalid parameter(s) passed to function query or queryRaw.')
    expect(f8).to.throw('[msnodesql] Invalid query string passed to function query. Type should be string.')
    expect(f9).to.throw('[msnodesql] Invalid query string passed to function queryRaw. Type should be string.')

    await env.sql.promises.query(env.connectionString, 'SELECT 1')
    await env.sql.promises.query(env.connectionString, 'SELECT 1', [])
    await env.sql.promises.query(env.connectionString, 'SELECT 1', null)
    // Error: [msnodesql] Invalid connection string passed to function query. Type should be string.
  })

  it('test retrieving a LOB string larger than max string size', testDone => {
    const stmt = env.theConnection.query('SELECT REPLICATE(CAST(\'B\' AS varchar(max)), 20000) AS \'LOB String\'')
    let len = 0
    stmt.on('column', (c, d) => {
      assert(c === 0)
      if (d) {
        len = d.length
      }
    })
    stmt.on('done', () => {
      assert(len === 20000)
      testDone()
    })
    stmt.on('error', e => {
      assert.ifError(e)
    })
  })

  it('query with errors', done => {
    const expectedError = new Error('[Microsoft][' + env.driver + '][SQL Server]Unclosed quotation mark after the character string \'m with NOBODY\'.')
    expectedError.sqlstate = '42000'
    expectedError.code = 105
    expectedError.severity = 15
    expectedError.procName = ''
    expectedError.lineNumber = 1
    const fns = [
      asyncDone => {
        assert.doesNotThrow(() => {
          env.theConnection.queryRaw('I\'m with NOBODY', e => {
            assert(e instanceof Error)
            assert(e.serverName.length > 0)
            delete e.serverName
            assert(e.message.includes('Unclosed quotation mark after the character'))
            asyncDone()
          })
        })
      },

      asyncDone => {
        assert.doesNotThrow(() => {
          const s = env.theConnection.queryRaw('I\'m with NOBODY')
          s.on('error', e => {
            assert(e instanceof Error)
            assert(e.serverName.length > 0)
            delete e.serverName
            assert(e.message.includes('Unclosed quotation mark after the character'))
            asyncDone()
          })
        })
      }
    ]

    env.async.series(fns, () => {
      done()
    })
  })

  it('simple query', async function handler () {
    const results = await env.theConnection.promises.query('SELECT 1 as X, \'ABC\', 0x0123456789abcdef', [], { replaceEmptyColumnNames: true })
    const buffer = Buffer.from('0123456789abcdef', 'hex')
    const expected = [{ X: 1, Column1: 'ABC', Column2: buffer }]
    expect(results.first).to.deep.equal(expected)
  })

  it('simple rawFormat query', async function handler () {
    const results = await env.theConnection.promises.query('SELECT 1 as X, \'ABC\', 0x0123456789abcdef ', [], { raw: true })
    const buffer = Buffer.from('0123456789abcdef', 'hex')
    const expectedMeta = [{ name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int' },
      { name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar' },
      { name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary' }]
    const expected = [[1, 'ABC', buffer]]
    expect(results.meta[0]).to.deep.equal(expectedMeta)
    expect(results.first).to.deep.equal(expected)
  })

  it('simple query of types like var%', async function handler () {
    const like = 'var%'
    const results = await env.theConnection.promises.query('SELECT name FROM sys.types WHERE name LIKE ?', [like])
    for (let row = 0; row < results.first.length; ++row) {
      assert(results.first[row].name.substring(0, 3) === 'var')
    }
  })

  it('streaming test', async function handler () {
    async function f0 () {
      return new Promise((resolve, reject) => {
        const like = 'var%'
        let currentRow = 0
        const metaExpected = [{ name: 'name', size: 128, nullable: false, type: 'text', sqlType: 'nvarchar' }]

        const stmt = env.theConnection.query('select name FROM sys.types WHERE name LIKE ?', [like])

        stmt.on('meta', meta => {
          assert.deepStrictEqual(meta, metaExpected)
        })
        stmt.on('row', idx => {
          assert(idx === currentRow)
          ++currentRow
        })
        stmt.on('column', (idx, data) => {
          assert(data.substring(0, 3) === 'var')
        })
        stmt.on('done', () => {
          resolve(true)
        })
        stmt.on('error', err => {
          reject(err)
        })
      })
    }

    await f0()
  })

  it('serialized queries with callbacks', async function handler () {
    const intMeta = { name: '', size: 10, nullable: false, type: 'number', sqlType: 'int' }
    const expected = Array
      .from(Array(5)
        .keys())
      .map(i => {
        return {
          meta: [intMeta],
          rows: [[i + 1]]
        }
      })

    async function f0 () {
      return new Promise((resolve, reject) => {
        const results = []
        for (let i = 1; i <= 5; ++i) {
          env.theConnection.queryRaw(`SELECT ${i}`, (e, r) => {
            if (e) reject(e)
            results.push(r)
            if (results.length === 5) {
              resolve(results)
            }
          })
        }
      })
    }

    const results = await f0()
    expect(results).to.deep.equal(expected)
  })

  it('serialized queries with promises', async function handler () {
    const intMeta = { name: '', size: 10, nullable: false, type: 'number', sqlType: 'int' }
    const range = Array
      .from(Array(5)
        .keys())

    const expectedMeta = range
      .map(() => [intMeta])

    const expected = range
      .map(i => [i])

    const promises = range.map(i => env.theConnection.promises.query(`SELECT ${i}`, [], { raw: true }))
    const results = await Promise.all(promises)
    const meta = results.map(r => r.meta[0])
    const rows = results.map(r => r.first[0])
    expect(meta).to.deep.equal(expectedMeta)
    expect(rows).to.deep.equal(expected)
  })

  it('multiple results from query in events', async function handler () {
    const expected = [
      [{ name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int' },
        { name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar' },
        { name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary' }],
      { row: 0 },
      { column: 0, data: 1, more: false },
      { column: 1, data: 'ABC', more: false },
      {
        column: 2,
        data: Buffer.from('0123456789abcdef', 'hex'),
        more: false
      },
      [
        { name: 'Y', size: 10, nullable: false, type: 'number', sqlType: 'int' },
        { name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar' },
        { name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary' }
      ],
      { row: 1 },
      { column: 0, data: 2, more: false },
      { column: 1, data: 'DEF', more: false },
      {
        column: 2,
        data: Buffer.from('fedcba9876543210', 'hex'),
        more: false
      }
    ]

    async function f0 () {
      return new Promise((resolve, reject) => {
        const r = env.theConnection.queryRaw('SELECT 1 as X, \'ABC\', 0x0123456789abcdef; ' +
          'SELECT 2 AS Y, \'DEF\', 0xfedcba9876543210')

        const received = []

        r.on('meta', m => {
          received.push(m)
        })
        r.on('row', idx => {
          received.push({ row: idx })
        })
        r.on('column', (idx, data, more) => {
          received.push({ column: idx, data, more })
        })
        r.on('done', () => {
          resolve(received)
        })
        r.on('error', e => {
          reject(e)
        })
      })
    }

    const results = await f0()
    expect(results).to.deep.equal(expected)
  })

  it('boolean return value from query', done => {
    env.theConnection.queryRaw('SELECT CONVERT(bit, 1) AS bit_true, CONVERT(bit, 0) AS bit_false',
      (err, results) => {
        assert.ifError(err)
        const expected = {
          meta: [{ name: 'bit_true', size: 1, nullable: true, type: 'boolean', sqlType: 'bit' },
            { name: 'bit_false', size: 1, nullable: true, type: 'boolean', sqlType: 'bit' }],
          rows: [[true, false]]
        }
        assert.deepStrictEqual(results, expected, 'Results didn\'t match')
        done()
      })
  })

  it('test retrieving a non-LOB string of max size', async function handler () {
    const res = await env.theConnection.promises.query('SELECT REPLICATE(\'A\', 8000) AS \'NONLOB String\'')
    expect(res.first[0]['NONLOB String']).to.equal(env.repeat('A', 8000))
  })

  it('test retrieving an empty string', async function handler () {
    const res = await env.theConnection.promises.query('SELECT \'\' AS \'Empty String\'')
    expect(res.first[0]['Empty String']).to.equal('')
  })

  /*
  it('test login failure', done => {
    // construct a connection string that will fail due to
    // the database not existing
    var badConnection = env.connectionString.replace('Database={' + database + '}', 'Database={DNE}')

    env.sql.query(badConnection, 'SELECT 1 as X', err => {
      // verify we get the expected error when the login fails
      assert.ok(err.message.indexOf('Login failed for user') > 0)
      assert.equal(err.sqlstate, 28000)
      done()
    })
  })
  */

  it('test function parameter validation', testDone => {
    let thrown = false

    const fns = [
      asyncDone => {
        // test the module level open, query and queryRaw functions
        try {
          env.sql.open(1, 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function open. Type should be string.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.query(() => {
            return 1
          }, 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown = true)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.queryRaw(['This', 'is', 'a', 'test'], 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function queryRaw. Type should be string.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        // test the module level open, query and queryRaw functions
        try {
          env.sql.open(env.connectionString, 5)
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid callback passed to function open. Type should be function.', 'Improper error returned')
        }
        assert(thrown = true)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.query(env.connectionString, () => {
            return 5
          })
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.queryRaw(env.connectionString, ['This', 'is', 'a', 'test'])
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        const stmt = env.sql.queryRaw(env.connectionString, 'SELECT 1')
        stmt.on('error', e => {
          assert.ifError(e)
        })
        stmt.on('closed', () => {
          asyncDone()
        })
      },

      asyncDone => {
        env.sql.queryRaw(env.connectionString, 'SELECT 1', e => {
          assert.ifError(e)
          asyncDone()
        })
      },

      asyncDone => {
        env.sql.queryRaw(env.connectionString, 'SELECT 1', [], e => {
          assert.ifError(e)
          asyncDone()
        })
      },

      asyncDone => {
        env.sql.queryRaw(env.connectionString, 'SELECT 1', null, e => {
          assert.ifError(e)
          asyncDone()
        })
      },

      asyncDone => {
        const stmt = env.sql.queryRaw(env.connectionString, 'SELECT 1', [])
        stmt.on('error', e => {
          assert.ifError(e)
        })
        stmt.on('closed', () => {
          asyncDone()
        })
      },

      asyncDone => {
        const stmt = env.sql.queryRaw(env.connectionString, 'SELECT 1', null)
        stmt.on('error', e => {
          assert.ifError(e)
        })
        stmt.on('closed', () => {
          asyncDone()
        })
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.queryRaw(env.connectionString, 'SELECT 1', 1)
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.sql.queryRaw(env.connectionString, 'SELECT 1', { a: 1, b: '2' }, () => {
          })
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.theConnection.query(1)
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown)
        asyncDone()
      },

      asyncDone => {
        thrown = false
        try {
          env.theConnection.queryRaw(() => {
            return 1
          })
        } catch (e) {
          thrown = true
          assert.strictEqual(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
          asyncDone()
        }
        assert(thrown)
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('verify metadata is retrieved for udt/geography types', async function handler () {
    const expectedMeta = [{
      name: 'GeogCol1',
      size: 0,
      nullable: true,
      type: 'binary',
      sqlType: 'udt',
      udtType: 'geography'
    }]
    const expectedData = [
      [Buffer.from('e610000001148716d9cef7d34740d7a3703d0a975ec08716d9cef7d34740cba145b6f3955ec0', 'hex')],
      [Buffer.from('e6100000010405000000dd24068195d34740f4fdd478e9965ec0508d976e12d3474083c0caa145965ec04e62105839d4474083c0caa145965ec04e62105839d44740f4fdd478e9965ec0dd24068195d34740f4fdd478e9965ec001000000020000000001000000ffffffff0000000003', 'hex')]
    ]

    const tableName = 'spatial_test'
    const promises = env.theConnection.promises
    await promises.query(env.dropTableSql(tableName))
    await promises.query(`CREATE TABLE ${tableName} ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText())`)
    await promises.query(`INSERT INTO ${tableName}(GeogCol1) VALUES (geography::STGeomFromText('LINESTRING(-122.360 47.656, -122.343 47.656 )', 4326))`)
    await promises.query(`INSERT INTO ${tableName} (GeogCol1) VALUES (geography::STGeomFromText('POLYGON((-122.358 47.653 , -122.348 47.649, -122.348 47.658, -122.358 47.658, -122.358 47.653))', 4326))`)
    const res = await promises.query(`SELECT GeogCol1 FROM ${tableName}`, [], { raw: true })
    expect(res.meta[0]).to.deep.equal(expectedMeta)
    expect(res.first).to.deep.equal(expectedData)
  })
})
