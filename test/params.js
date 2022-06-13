// ---------------------------------------------------------------------------------------------------------------------------------
// File: params.js
// Contents: test suite for parameters
//
// Copyright Microsoft Corporation and contributors
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
// --------------------------------------------------------------------------------------------------------------------------------
//

'use strict'

const assert = require('assert')

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('params', function () {
  this.timeout(60000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  async function testBoilerPlateAsync (tableName, tableFields, insertFunction, verifyFunction) {
    let tableFieldsSql = ' (id int identity, '
    for (const field in tableFields) {
      if (Object.prototype.hasOwnProperty.call(tableFields, field)) {
        tableFieldsSql += field + ' ' + tableFields[field] + ','
      }
    }
    tableFieldsSql = tableFieldsSql.substr(0, tableFieldsSql.length - 1)
    tableFieldsSql += ')'
    const todrop = env.dropTableSql(tableName)
    await env.theConnection.promises.query(todrop)
    const createQuery = `CREATE TABLE ${tableName}${tableFieldsSql}`
    await env.theConnection.promises.query(createQuery)
    const clusteredIndexSql = ['CREATE CLUSTERED INDEX IX_', tableName, ' ON ', tableName, ' (id)'].join('')
    await env.theConnection.promises.query(clusteredIndexSql)
    if (insertFunction) await insertFunction()
    if (verifyFunction) await verifyFunction()
  }

  function testBoilerPlate (tableName, tableFields, insertFunction, verifyFunction, doneFunction) {
    let tableFieldsSql = ' (id int identity, '

    for (const field in tableFields) {
      if (Object.prototype.hasOwnProperty.call(tableFields, field)) {
        tableFieldsSql += field + ' ' + tableFields[field] + ','
      }
    }
    tableFieldsSql = tableFieldsSql.substr(0, tableFieldsSql.length - 1)
    tableFieldsSql += ')'

    const sequence = [

      asyncDone => {
        const dropQuery = `DROP TABLE ${tableName}`
        env.theConnection.query(dropQuery, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const createQuery = `CREATE TABLE ${tableName}${tableFieldsSql}`
        env.theConnection.query(createQuery,
          e => {
            assert.ifError(e, 'Error creating table')
            asyncDone()
          })
      },

      asyncDone => {
        const clusteredIndexSql = ['CREATE CLUSTERED INDEX IX_', tableName, ' ON ', tableName, ' (id)'].join('')
        env.theConnection.query(clusteredIndexSql,
          e => {
            assert.ifError(e, 'Error creating index')
            asyncDone()
          })
      },

      asyncDone => {
        insertFunction(asyncDone)
      },

      asyncDone => {
        verifyFunction(() => {
          asyncDone()
        })
      }]

    env.async.series(sequence,
      () => {
        doneFunction()
      })
  }

  it('insert bigint as parameter', async function handler () {
    const tableName = 'test_bigint'
    await testBoilerPlateAsync(tableName, { bigint_test: 'bigint' },
      async function () {
        await env.theConnection.promises.query(`INSERT INTO ${tableName} VALUES (?)`, [0x80000000])
      },
      async function handler () {
        const r = await env.theConnection.promises.query(`SELECT bigint_test FROM ${tableName}`, [], { raw: true })
        const expectedMeta = [{ name: 'bigint_test', size: 19, nullable: true, type: 'number', sqlType: 'bigint' }]
        const expected = [
          [0x80000000]
        ]
        assert.deepStrictEqual(expected, r.first)
        assert.deepStrictEqual(expectedMeta, r.meta[0])
      })
  })

  it('query a numeric - configure connection to return as string', async function handler () {
    const num = '12345678.876'
    env.theConnection.setUseNumericString(true)
    const q = `SELECT CAST(${num} AS numeric(11, 3)) as number`
    const res = await env.theConnection.promises.query(q)
    assert.deepStrictEqual(res.first[0].number, num)
  })

  it('insert min and max number values', async function handler () {
    await testBoilerPlateAsync(
      'minmax_test',
      { f: 'float' },

      async function handler () {
        const promises = env.theConnection.promises
        await promises.query('INSERT INTO minmax_test (f) VALUES (?)', [Number.MAX_VALUE])
        await promises.query('INSERT INTO minmax_test (f) VALUES (?)', [-Number.MAX_VALUE])
      },

      async function handler () {
        const r = await env.theConnection.promises.query('SELECT f FROM minmax_test order by id', [], { raw: true })
        const expectedMeta = [{ name: 'f', size: 53, nullable: true, type: 'number', sqlType: 'float' }]
        const expected = [
          [1.7976931348623157e+308],
          [-1.7976931348623157e+308]
        ]
        assert.deepStrictEqual(expected, r.first)
        assert.deepStrictEqual(expectedMeta, r.meta[0])
      })
  })

  it('query a -ve numeric - configure query to return as string', async function handler () {
    const num = '-12345678'
    const q = `select ${num} as number`
    const res = await env.theConnection.promises.query({
      query_str: q,
      numeric_string: true
    })
    assert.deepStrictEqual(res.first[0].number, num)
  })

  it('query as numeric - configure query to return as string', async function handler () {
    const num = '1234567891'
    const q = `SELECT CAST(${num} AS numeric(10, 0)) as number`
    const res = await env.theConnection.promises.query({
      query_str: q,
      numeric_string: true
    })
    assert.deepStrictEqual(res.first[0].number, num)
  })

  async function runTestAsync (columnDef, len) {
    await testBoilerPlateAsync('test_large_insert', { large_insert: columnDef },
      async function handler () {
        const largeText = env.repeat('A', len)
        await env.theConnection.promises.query('INSERT INTO test_large_insert (large_insert) VALUES (?)',
          [largeText])
      },
      async function handler () {
        const r = await env.theConnection.promises.query('SELECT large_insert FROM test_large_insert')
        assert.deepStrictEqual(r.first[0].large_insert.length, len)
      })
  }

  it('query a bigint implicit - configure query to return as string', async function handler () {
    const num = '9223372036854775807'
    const q = `SELECT ${num} as number`
    const res = await env.theConnection.promises.query({
      query_str: q,
      numeric_string: true
    })
    assert.deepStrictEqual(res.first[0].number, num)
  })

  it('query a bigint with cast - configure query to return as string', async function handler () {
    const num = '9223372036854775807'
    const q = `SELECT CAST(${num} AS bigint) as number`
    const res = await env.theConnection.promises.query({
      query_str: q,
      numeric_string: true
    })
    assert.deepStrictEqual(res.first[0].number, num)
  })

  it('bind via a declare and insert', async function handler () {
    const tableName = 'tmp_int'
    const tableFieldsSql = `(
     n1 int,
     n2 int
    )`
    const params = [10, 20]
    await env.theConnection.promises.query(env.dropTableSql(tableName))
    await env.theConnection.promises.query(`CREATE TABLE ${tableName}${tableFieldsSql}`)
    env.theConnection.query('declare @_p0 int = ?, @_p1 int = ?; insert into [tmp_int] ([n1],[n2]) values (@_p0,@_p1)',
      params)
    const res = await env.getTableCount(tableName)
    assert.deepStrictEqual(res, 1)
  })

  it('query containing Swedish "åäö" as sql query literal no params', async function handler () {
    const STR_LEN = 10
    const str = 'åäö'.repeat(STR_LEN)
    const res = await env.theConnection.promises.query(`select '${str}' as data`)
    assert.deepStrictEqual(res.first[0].data, str)
  })

  it('query containing ascii chars as sql query literal no params', async function handler () {
    const STR_LEN = 10
    const str = 'a'.repeat(STR_LEN)
    const res = await env.theConnection.promises.query(`select '${str}' as data`)
    assert.deepStrictEqual(res.first[0].data, str)
  })

  it('query containing Swedish "åäö" as param', async function handler () {
    const STR_LEN = 10
    const str = 'åäö'.repeat(STR_LEN)
    const res = await env.theConnection.promises.query('declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS data', [str])
    assert.deepStrictEqual(res.first[0].data, str)
  })

  it('insert/query containing Swedish "åäö" as param', async function handler () {
    const STR_LEN = 5
    const str = 'åäö'.repeat(STR_LEN)
    const name = 'test_swedish_insert'
    await testBoilerPlateAsync(name, { text_col: 'nvarchar(50)' },
      async function () {
        await env.theConnection.promises.query(`INSERT INTO ${name} (text_col) VALUES (?)`, [str])
      },
      async function () {
        const res = await env.theConnection.promises.query(`SELECT text_col FROM ${name}`)
        assert.deepStrictEqual(res.first[0].text_col, str)
      })
  })

  it('bind a null to binary using sqlTypes.asVarBinary(null)', async function handler () {
    const res = await env.theConnection.promises.query('declare @bin binary(4) = ?; select @bin as bin', [env.sql.VarBinary(null)])
    const expected = [{
      bin: null
    }]
    assert.deepStrictEqual(res.first, expected)
  })

  it('select a long string using streaming - ensure no fragmentation', testDone => {
    const longString = env.repeat('a', 40 * 1024)
    const expected = [
      {
        long_string: longString
      }
    ]
    const res = []
    const colNames = []
    const query = env.theConnection.query('declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS long_string', [longString])
    query.on('column', (c, d) => {
      assert(c === 0)
      const obj = {}
      obj[colNames[c]] = d
      res.push(obj)
    })
    query.on('error', e => {
      assert(e)
    })
    query.on('meta', m => {
      colNames.push(m[0].name)
    })
    query.on('done', () => {
      assert.deepStrictEqual(expected, res)
      testDone()
    })
  })

  it('mssql set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @s AS s', async function handler () {
    const STR_LEN = 2001
    const str = '1'.repeat(STR_LEN)
    //  [sql.WLongVarChar(str)]
    const res = await env.theConnection.promises.query('declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS data', [str])
    const expected = [{
      data: str
    }]
    assert.deepStrictEqual(res.first, expected)
  })

  // declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @s AS s;

  it('insert string 100 in nchar.100', async function handler () {
    await runTestAsync('nchar(100)', 100)
  })

  it('insert string 500 in nvarchar.1000', async function handler () {
    await runTestAsync('nvarchar(1000)', 500)
  })

  it('insert string 1 x 1000 in varchar.max', async function handler () {
    await runTestAsync('varchar(max)', 1000)
  })

  it('insert string 4 x 1000 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 4 * 1000)
  })

  it('insert string 3999 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 3999)
  })

  it('insert string 4001 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 4001)
  })

  it('insert string 4 x 1024 in varchar(8000)', async function handler () {
    await runTestAsync('varchar(8000)', 4 * 1024)
  })

  it('insert string 6 x 1024 in varchar(8000)', async function handler () {
    await runTestAsync('varchar(8000)', 6 * 1024)
  })

  it('insert string 30 x 1024 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 30 * 1024)
  })

  it('insert string 2 x 1024 * 1024 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 2 * 1024 * 1024)
  })

  it('insert string 60 x 1024 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 60 * 1024)
  })

  it('verify empty string is sent as empty string, not null', async function handler () {
    const res = await env.theConnection.promises.query('declare @s NVARCHAR(MAX) = ?; select @s as data', [''])
    const expected = [{
      data: ''
    }]
    assert.deepStrictEqual(res.first, expected)
  })

  it('verify that non-Buffer object parameter returns an error', async function handler () {
    const o = { field1: 'value1', field2: -1 }
    await testBoilerPlateAsync('non_buffer_object',
      { object_col: 'varbinary(100)' },
      async function () {
        try {
          await env.theConnection.promises.query('INSERT INTO non_buffer_object (object_col) VALUES (?)', [o.field1, o.field2])
          assert.deepStrictEqual(1, 0)
        } catch (e) {
          assert(e)
        }
      })
  })

  it('verify Buffer objects as input parameters', async function handler () {
    const b = Buffer.from('0102030405060708090a', 'hex')
    await testBoilerPlateAsync(
      'buffer_param_test',
      { buffer_param: 'varbinary(100)' },

      async function handler () {
        await env.theConnection.promises.query('INSERT INTO buffer_param_test (buffer_param) VALUES (?)',
          [b])
      },

      async function handler () {
        const r = await env.theConnection.promises.query('SELECT buffer_param FROM buffer_param_test WHERE buffer_param = ?',
          [b])
        assert.deepStrictEqual(r.first.length, 1)
        assert.deepStrictEqual(r.first[0].buffer_param, b)
      })
  })

  it('select a long string using promise', async function handler () {
    const longString = env.repeat('a', 50000)
    const res = await env.theConnection.promises.query('select ? as long_string', [longString])
    assert.deepStrictEqual(res.first[0].long_string, longString)
  })

  it('select a long buffer using callback', testDone => {
    function repeat (a, num) {
      return new Array(num + 1).join(a)
    }

    const longString = repeat('a', 50000)
    const longBuffer = Buffer.from(longString)
    const expected = [
      {
        long_binary: longBuffer
      }
    ]
    env.theConnection.query('select ? as long_binary', [longBuffer], (err, res) => {
      assert.ifError(err)
      assert.deepStrictEqual(res, expected)
      testDone()
    })
  })

  it('verify buffer longer than column causes error', async function handler () {
    const b = Buffer.from('0102030405060708090a', 'hex')
    await testBoilerPlateAsync('buffer_param_test',
      { buffer_param: 'varbinary(5)' },
      async function handler () {
        try {
          const res = await env.theConnection.promises.query('INSERT INTO buffer_param_test (buffer_param) VALUES (?)', [b])
          assert(res)
        } catch (e) {
          const expectedError = new Error('[Microsoft][SQL Server Native Client 11.0][SQL Server]String or binary data would be truncated.')
          expectedError.sqlstate = '22001'
          expectedError.code = 8152
          assert(e.message.indexOf('String or binary data would be truncated') >= 0)
        }
      })
  })

  it('verify null string is sent as null, not empty string', async function handler () {
    const res = await env.theConnection.promises.query('declare @s NVARCHAR(MAX) = ?; select @s as data', [null])
    const expected = null
    assert.deepStrictEqual(expected, res.first[0].data)
  })

  it('verify single char string param', async function handler () {
    const char = 'p'
    const res = await env.theConnection.promises.query('declare @s NVARCHAR(MAX) = ?; select @s as data',
      [char])
    assert.deepStrictEqual(res.first[0].data, char)
  })

  it('verify bool (true) to sql_variant', async function handler () {
    const v = 'true'
    const res = await env.theConnection.promises.query(`select cast(CAST('${v}' as bit) as sql_variant) as data;`)
    assert.deepStrictEqual(res.first[0].data, true)
  })

  it('verify bool (false) to sql_variant', async function handler () {
    const v = 'false'
    const res = await env.theConnection.promises.query(`select cast(CAST('${v}' as bit) as sql_variant) as data;`)
    assert.deepStrictEqual(res.first[0].data, false)
  })

  it('verify varchar to sql_variant', async function handler () {
    const v = 'hello'
    const res = await env.theConnection.promises.query(`select cast('${v}' as sql_variant) as data;`)
    assert.deepStrictEqual(res.first[0].data, v)
  })

  it('verify numeric decimal to sql_variant', async function handler () {
    const v = 11.77
    const res = await env.theConnection.promises.query(`select cast(${v} as sql_variant) as data;`)
    assert.deepStrictEqual(res.first[0].data, v)
  })

  it('verify int to sql_variant', async function handler () {
    const v = 10000
    const res = await env.theConnection.promises.query(`select cast(${v} as sql_variant) as data;`)
    assert.deepStrictEqual(res.first[0].data, v)
  })

  it('verify getdate (datetime) to sql_variant',
    async function handler () {
      const smalldt = env.timeHelper.getUTCDateHH(new Date())
      const res = await env.theConnection.promises.query('select cast(convert(datetime, ?) as sql_variant) as data', [smalldt])
      let date = res.first[0].data
      assert(date instanceof Date)
      date = env.timeHelper.getUTCDateHH(date)
      assert(smalldt.getYear() === date.getYear())
      assert(smalldt.getMonth() === date.getMonth())
      assert(smalldt.getDay() === date.getDay())
    })

  it('verify getdate to sql_variant', async function handler () {
    const res = await env.theConnection.promises.query('select cast(getdate() as sql_variant) as data;')
    const date = res.first[0].data
    assert(date instanceof Date)
  })

  it('insert null as parameter', testDone => {
    testBoilerPlate(
      'null_param_test',
      { null_test: 'varchar(1)' },
      done => {
        env.theConnection.queryRaw('INSERT INTO null_param_test (null_test) VALUES (?)', [null], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT null_test FROM null_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'null_test', size: 1, nullable: true, type: 'text', sqlType: 'varchar' }],
            rows: [[null]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('invalid numbers cause errors', testDone => {
    const sequence = [
      asyncDone => {
        env.theConnection.queryRaw('INSERT INTO invalid_numbers_test (f) VALUES (?)', [Number.POSITIVE_INFINITY], e => {
          const expectedError = new Error('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
          expectedError.code = -1
          expectedError.sqlstate = 'IMNOD'
          assert.deepStrictEqual(e, expectedError)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.queryRaw('INSERT INTO invalid_numbers_test (f) VALUES (?)', [Number.NEGATIVE_INFINITY], e => {
          const expectedError = new Error('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
          expectedError.code = -1
          expectedError.sqlstate = 'IMNOD'

          assert.deepStrictEqual(e, expectedError)
          asyncDone()
        })
      }
    ]

    testBoilerPlate(
      'invalid_numbers_test',
      { f: 'float' },
      done => {
        env.async.series(sequence, () => {
          done()
        })
      },
      done => {
        done()
      },
      () => {
        testDone()
      }
    )
  })

  it('insert string as parameter', testDone => {
    testBoilerPlate(
      'string_param_test',
      { string_test: 'nvarchar(100)' },
      done => {
        env.theConnection.queryRaw('INSERT INTO string_param_test (string_test) VALUES (?)', ['This is a test'], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT string_test FROM string_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'string_test', size: 100, nullable: true, type: 'text', sqlType: 'nvarchar' }],
            rows: [['This is a test']]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('insert a bool as a parameter', testDone => {
    testBoilerPlate('bool_param_test',
      { bool_test: 'bit' },

      done => {
        env.theConnection.queryRaw('INSERT INTO bool_param_test (bool_test) VALUES (?)', [true], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT bool_test FROM bool_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'bool_test', size: 1, nullable: true, type: 'boolean', sqlType: 'bit' }],
            rows: [[true]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },

      () => {
        testDone()
      })
  })

  it('insert largest positive int as parameter', testDone => {
    testBoilerPlate('int_param_test', { int_test: 'int' },
      done => {
        env.theConnection.queryRaw('INSERT INTO int_param_test (int_test) VALUES (?)', [0x7fffffff], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT int_test FROM int_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'int_test', size: 10, nullable: true, type: 'number', sqlType: 'int' }],
            rows: [[2147483647]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('insert largest negative int as parameter', testDone => {
    testBoilerPlate('int_param_test', { int_test: 'int' },

      done => {
        env.theConnection.queryRaw('INSERT INTO int_param_test (int_test) VALUES (?)', [-0x80000000], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT int_test FROM int_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'int_test', size: 10, nullable: true, type: 'number', sqlType: 'int' }],
            rows: [[-2147483648]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('insert largest bigint as parameter', testDone => {
    testBoilerPlate('bigint_param_test', { bigint_test: 'bigint' },
      done => {
        env.theConnection.queryRaw('INSERT INTO bigint_param_test (bigint_test) VALUES (?)', [0x4fffffffffffffff], e => {
          assert.ifError(e)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT bigint_test FROM bigint_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{ name: 'bigint_test', size: 19, nullable: true, type: 'number', sqlType: 'bigint' }],
            rows: [[0x4fffffffffffffff]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },

      () => {
        testDone()
      })
  })

  it('insert decimal as parameter', testDone => {
    testBoilerPlate('decimal_param_test', { decimal_test: 'decimal(18,7)' },

      done => {
        env.theConnection.queryRaw('INSERT INTO decimal_param_test (decimal_test) VALUES (?)', [3.141593],
          e => {
            assert.ifError(e)
            done()
          })
      },

      done => {
        env.theConnection.queryRaw('SELECT decimal_test FROM decimal_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{
              name: 'decimal_test',
              size: 18,
              nullable: true,
              type: 'number',
              sqlType: 'decimal'
            }],
            rows: [[3.141593]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('insert decimal as bigint parameter', testDone => {
    testBoilerPlate('decimal_as_bigint_param_test', { decimal_bigint: 'bigint' },
      done => {
        env.theConnection.queryRaw('INSERT INTO decimal_as_bigint_param_test (decimal_bigint) VALUES (?)', [123456789.0],
          e => {
            assert.ifError(e)
            done()
          })
      },

      done => {
        env.theConnection.queryRaw('SELECT decimal_bigint FROM decimal_as_bigint_param_test', (e, r) => {
          assert.ifError(e)
          const expected = {
            meta: [{
              name: 'decimal_bigint',
              size: 19,
              nullable: true,
              type: 'number',
              sqlType: 'bigint'
            }],
            rows: [[123456789]]
          }
          assert.deepStrictEqual(expected, r)
          done()
        })
      },

      () => {
        testDone()
      })
  })

  it('insert date as parameter', testDone => {
    const utcDate = env.timeHelper.getUTCDateTime()
    testBoilerPlate('date_param_test', { date_test: 'datetimeoffset' },

      done => {
        env.theConnection.queryRaw('INSERT INTO date_param_test (date_test) VALUES (?)', [utcDate],
          e => {
            assert.ifError(e)
            done()
          })
      },

      done => {
        env.theConnection.queryRaw('SELECT date_test FROM date_param_test', (e, r) => {
          assert.ifError(e)
          assert.strictEqual(utcDate.toISOString(), r.rows[0][0].toISOString(), 'dates are not equal')
          assert.strictEqual(r.rows[0][0].nanosecondsDelta, 0, 'nanoseconds not 0')
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('verify js date inserted into datetime field', testDone => {
    const utcDate = env.timeHelper.getUTCDateTime()

    testBoilerPlate('datetime_test', { datetime_test: 'datetime' },
      done => {
        env.theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], (e, r) => {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT * FROM datetime_test', (e, r) => {
          assert.ifError(e)
          assert(r.rows[0][0], utcDate)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('verify empty string inserted into nvarchar field', testDone => {
    testBoilerPlate('emptystring_test', { emptystring_test: 'nvarchar(1)' },
      done => {
        env.theConnection.queryRaw('INSERT INTO emptystring_test (emptystring_test) VALUES (?)', [''], (e, r) => {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT * FROM emptystring_test', (e, r) => {
          assert.ifError(e)
          assert(r.rows[0][0], '')
          done()
        })
      },

      () => {
        testDone()
      })
  })

  it('insert large string into max column', testDone => {
    testBoilerPlate('test_large_insert', { large_insert: 'nvarchar(max) ' },
      done => {
        const largeText = env.repeat('A', 10000)
        env.theConnection.query('INSERT INTO test_large_insert (large_insert) VALUES (?)', [largeText], e => {
          assert.ifError(e, 'Error inserting large string')
          done()
        })
      },

      done => {
        env.theConnection.query('SELECT large_insert FROM test_large_insert', (e, r) => {
          assert.ifError(e)
          assert(r[0].large_insert.length === 10000, 'Incorrect length for large insert')
          done()
        })
      },

      () => {
        testDone()
      })
  })

  it('verify js date inserted into datetime field', testDone => {
    const utcDate = env.timeHelper.getUTCDateTime()

    testBoilerPlate('datetime_test', { datetime_test: 'datetime' },

      done => {
        env.theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], (e, r) => {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT * FROM datetime_test', (e, r) => {
          assert.ifError(e)
          assert(r.rows[0][0], utcDate)
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('verify js date before 1970 inserted into datetime field', testDone => {
    const ancientDate = new Date(1492, 10, 11, 6, 32, 46, 578)
    const utcDate = env.timeHelper.getUTCDateTime(ancientDate)

    testBoilerPlate('datetime_test', { datetime_test: 'datetimeoffset(3)' },

      done => {
        env.theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], (e, r) => {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      done => {
        env.theConnection.queryRaw('SELECT datetime_test FROM datetime_test', (e, r) => {
          assert.ifError(e)
          assert.strictEqual(r.rows[0][0].valueOf(), utcDate.valueOf())
          done()
        })
      },
      () => {
        testDone()
      })
  })

  // verify fix for a bug that would return the wrong day when a datetimeoffset was inserted where the date
  // was before 1/1/1970 and the time was midnight.
  it('verify dates with midnight time', testDone => {
    const midnightDate = new Date(Date.parse('2030-08-13T00:00:00.000Z'))
    midnightDate.nanosecondsDelta = 0

    testBoilerPlate('midnight_date_test', { midnight_date_test: 'datetimeoffset(3)' },
      done => {
        const insertQuery = 'INSERT INTO midnight_date_test (midnight_date_test) VALUES (?);'
        env.theConnection.queryRaw(insertQuery, [midnightDate], e => {
          assert.ifError(e)
          done()
        })
      },
      // test valid dates
      done => {
        env.theConnection.queryRaw('SELECT midnight_date_test FROM midnight_date_test', (e, r) => {
          assert.ifError(e)
          const expectedDates = []
          expectedDates.push([midnightDate])
          const expectedResults = {
            meta: [{
              name: 'midnight_date_test',
              size: 30,
              nullable: true,
              type: 'date',
              sqlType: 'datetimeoffset'
            }],
            rows: expectedDates
          }
          assert.deepStrictEqual(expectedResults.meta, r.meta)
          assert(r.rows.length === 1)
          for (const row in r.rows) {
            for (const d in row) {
              assert.deepStrictEqual(expectedResults.rows[row][d], r.rows[row][d])
            }
          }
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('verify bug fix for last day of the year error', testDone => {
    const eoyDate = new Date(Date.parse('1960-12-31T11:12:13.000Z'))
    eoyDate.nanosecondsDelta = 0
    testBoilerPlate('eoy_date_test', { eoy_date_test: 'datetimeoffset(3)' },
      done => {
        const insertQuery = 'INSERT INTO eoy_date_test (eoy_date_test) VALUES (?);'
        env.theConnection.queryRaw(insertQuery, [eoyDate], e => {
          assert.ifError(e)
          done()
        })
      },

      // test valid dates
      done => {
        env.theConnection.queryRaw('SELECT eoy_date_test FROM eoy_date_test', (e, r) => {
          assert.ifError(e)
          const expectedDates = []
          expectedDates.push([eoyDate])
          const expectedResults = {
            meta: [{
              name: 'eoy_date_test',
              size: 30,
              nullable: true,
              type: 'date',
              sqlType: 'datetimeoffset'
            }],
            rows: expectedDates
          }
          assert.deepStrictEqual(expectedResults.meta, r.meta)
          assert(r.rows.length === 1)
          for (const row in r.rows) {
            for (const d in row) {
              assert.deepStrictEqual(expectedResults.rows[row][d], r.rows[row][d])
            }
          }
          done()
        })
      },
      () => {
        testDone()
      })
  })

  it('bind a Buffer([0,1,2,3])] to binary', testDone => {
    env.theConnection.query('declare @bin binary(4) = ?; select @bin as bin', [Buffer.from([0, 1, 2, 3])], (err, res) => {
      assert.ifError(err)
      const expected = [{
        bin: Buffer.from([0, 1, 2, 3])
      }]
      assert.deepStrictEqual(expected, res)
      testDone()
    })
  })
})
