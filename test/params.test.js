// ---------------------------------------------------------------------------------------------------------------------------------
// File: params.test.js
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

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

// Enable trace-level logging for debugging test failures
const sql = require('../lib/sql')
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)
// Optionally enable file logging for detailed debugging
sql.logger.setLogFile('/tmp/msnodesqlv8-params-test.log')
console.log('Logger configured for params.test.js:', sql.logger.getConfiguration())

/* globals describe it */

describe('params', function () {
  this.timeout(60000)

  this.beforeEach(done => {
    sql.logger.info('Starting test setup', 'params.test.beforeEach')
    env.open().then(() => {
      sql.logger.info('Test environment opened successfully', 'params.test.beforeEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to open test environment: ${e}`, 'params.test.beforeEach')
      console.error(e)
    })
  })

  this.afterEach(done => {
    sql.logger.info('Starting test cleanup', 'params.test.afterEach')
    env.close().then(() => {
      sql.logger.info('Test environment closed successfully', 'params.test.afterEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to close test environment: ${e}`, 'params.test.afterEach')
      console.error(e)
    })
  })

  class MetaTypes {
    static int = [
      {
        name: 'int_test',
        size: 10,
        nullable: true,
        type: 'number',
        sqlType: 'int'
      }
    ]

    static bigint = [
      {
        name: 'bigint_test',
        size: 19,
        nullable: true,
        type: 'number',
        sqlType: 'bigint'
      }
    ]

    static decimal = [
      {
        name: 'decimal_test',
        size: 18,
        nullable: true,
        type: 'number',
        sqlType: 'decimal'
      }
    ]

    static number = [
      {
        name: 'bigint_test',
        size: 19,
        nullable: true,
        type: 'number',
        sqlType: 'bigint'
      }
    ]

    static datetimeOffset = [
      {
        name: 'datetimeoffset_test',
        size: 30,
        nullable: true,
        type: 'date',
        sqlType: 'datetimeoffset'
      }
    ]

    static bool = [
      {
        name: 'bit_test',
        size: 1,
        nullable: true,
        type: 'boolean',
        sqlType: 'bit'
      }
    ]

    static nvarchar = [
      {
        name: 'nvarchar_test',
        size: 100,
        nullable: true,
        type: 'text',
        sqlType: 'nvarchar'
      }
    ]

    static varchar = [
      {
        name: 'varchar_test',
        size: 1,
        nullable: true,
        type: 'text',
        sqlType: 'varchar'
      }
    ]
  }

  async function testBoilerPlateAsync (tableName, tableFields, insertFunction, verifyFunction) {
    const fieldsSql = Object.keys(tableFields).map(field => `${field} ${tableFields[field]}`)
    const tableFieldsSql = `(id int identity, ${fieldsSql.join(', ')})`
    const promises = env.theConnection.promises
    const todrop = env.dropTableSql(tableName)
    await promises.query(todrop)
    const createQuery = `CREATE TABLE ${tableName}${tableFieldsSql}`
    await promises.query(createQuery)
    const clusteredIndexSql = ['CREATE CLUSTERED INDEX IX_', tableName, ' ON ', tableName, ' (id)'].join('')
    await promises.query(clusteredIndexSql)
    if (insertFunction) await insertFunction()
    if (verifyFunction) await verifyFunction()
  }

  async function runTestAsync (columnDef, len) {
    await testBoilerPlateAsync('test_large_insert', { large_insert: columnDef },
      async function handler () {
        const largeText = env.repeat('A', len)
        await env.theConnection.promises.query('INSERT INTO test_large_insert (large_insert) VALUES (?)',
          [largeText])
      },
      async function handler () {
        const r = await env.theConnection.promises.query('SELECT large_insert FROM test_large_insert')
        console.log('Query result:', JSON.stringify({
          hasFirst: !!r.first,
          firstLength: r.first ? r.first.length : 'no first',
          firstRow: r.first?.[0] ? r.first[0] : 'no row',
          largeInsert: r.first?.[0]?.large_insert
            ? `string of length ${r.first[0].large_insert.length}`
            : 'no large_insert'
        }, null, 2))
        assert.deepStrictEqual(r.first[0].large_insert.length, len)
      })
  }

  async function insertSelectType (v, type, expectedMeta) {
    const idx = type.indexOf('(')
    let name = type
    if (idx > 0) {
      name = type.substring(0, idx)
    }
    const tableName = `${name}_param_test`
    const columnName = `${name}_test`
    const tableFields = {}
    tableFields[columnName] = type
    await testBoilerPlateAsync(tableName,
      tableFields,
      async function handler () {
        await env.theConnection.promises.query(`INSERT INTO ${tableName} (${columnName}) VALUES (?)`,
          [v])
      },

      async function handler () {
        const r = await env.theConnection.promises.query(`SELECT ${columnName} FROM ${tableName}`,
          [],
          { raw: true })
        const rows = r.first
        const expected = [[v]]
        const metaType = r.meta[0][0].type
        if (metaType === 'date' || metaType === 'datetime') {
          delete rows[0][0].nanosecondsDelta
        }
        // console.log(JSON.stringify(rows))
        // console.log(JSON.stringify(expected))
        expect(rows).to.deep.equal(expected)
        if (expectedMeta) expect(r.meta[0]).to.deep.equal(expectedMeta)
      })
  }

  it('insert largest negative int as parameter', async function handler () {
    await insertSelectType(-0x80000000, 'int', MetaTypes.int)
  })

  it('insert date as parameter', async function handler () {
    const utcDate = env.timeHelper.getUTCDateHHMMSS()
    await testBoilerPlateAsync(
      'date_param_test',
      { date_test: 'datetimeoffset' },

      async function handler () {
        await env.theConnection.promises.query('INSERT INTO date_param_test (date_test) VALUES (?)',
          [utcDate])
      },

      async function handler () {
        const r = await env.theConnection.promises.query('SELECT date_test FROM date_param_test', [], { raw: true })
        const lhs = utcDate.toISOString()
        const r1c1 = r.first[0][0]
        const rhs = r1c1.toISOString()
        assert.strictEqual(lhs, rhs)
        assert.strictEqual(r1c1.nanosecondsDelta, 0)
      })
  })

  it('verify that non-Buffer object parameter returns an error', async function handler () {
    if (env.isEncryptedConnection()) return
    const o = { field1: 'value1', field2: -1 }
    await testBoilerPlateAsync('non_buffer_object',
      { object_col: 'varbinary(100)' },
      async function handler () {
        await expect(env.theConnection.promises.query('INSERT INTO non_buffer_object (object_col) VALUES (?)',
          [o.field1, o.field2]))
          .to.be.rejectedWith('Implicit conversion from data type nvarchar to varbinary is not allowed')
      })
  })

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

  it('insert min and max number values', async function handler () {
    await testBoilerPlateAsync(
      'minmax_test',
      { f: 'float' },

      async function handler () {
        const promises = env.theConnection.promises
        const sql = 'INSERT INTO minmax_test (f) VALUES (?)'
        await promises.query(sql, [Number.MAX_VALUE])
        await promises.query(sql, [-Number.MAX_VALUE])
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

  describe('params numeric string', function () {
    it('query a numeric - configure connection to return as string', async function handler () {
      const num = '12345678.876'
      env.theConnection.setUseNumericString(true)
      const q = `SELECT CAST(${num} AS numeric(11, 3)) as number`
      const res = await env.theConnection.promises.query(q)
      assert.deepStrictEqual(res.first[0].number, num)
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
  })

  it('bind via a declare and insert', async function handler () {
    sql.logger.info('TEST START: bind via a declare and insert', 'params.test')
    const tableName = 'tmp_int'
    const tableFieldsSql = `(
     n1 int,
     n2 int
    )`
    const params = [10, 20]
    const promises = env.theConnection.promises
    await promises.query(env.dropTableSql(tableName))
    await promises.query(`CREATE TABLE ${tableName}${tableFieldsSql}`)
    await promises.query('declare @_p0 int = ?, @_p1 int = ?; insert into [tmp_int] ([n1],[n2]) values (@_p0,@_p1)', params)
    const res = await env.getTableCount(tableName)
    assert.deepStrictEqual(res, 1)
    sql.logger.info('TEST END: bind via a declare and insert', 'params.test')
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
    const varbinaryParam = env.sql.VarBinary(null)
    console.log('VarBinary param:', JSON.stringify(varbinaryParam, null, 2))
    const res = await env.theConnection.promises.query('declare @bin binary(4) = ?; select @bin as bin', [varbinaryParam])
    const expected = [{
      bin: null
    }]
    assert.deepStrictEqual(res.first, expected)
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

  describe('params string boundary', function () {
    it('insert string 4001 in varchar(max)', async function handler () {
      await runTestAsync('varchar(max)', 4001)
    })

    it('insert string 1 x 1000 in varchar.max', async function handler () {
      await runTestAsync('varchar(max)', 1000)
    })

    // declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @s AS s;

    it('insert string 100 in nchar.100', async function handler () {
      await runTestAsync('nchar(100)', 100)
    })

    it('insert string 500 in nvarchar.1000', async function handler () {
      await runTestAsync('nvarchar(1000)', 500)
    })

    it('insert string 4 x 1000 in varchar(max)', async function handler () {
      await runTestAsync('varchar(max)', 4 * 1000)
    })

    it('insert string 3999 in varchar(max)', async function handler () {
      await runTestAsync('varchar(max)', 3999)
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

  it('select a long buffer using callback', async function handler () {
    const longString = env.repeat('a', 50000)
    const longBuffer = Buffer.from(longString)
    const res = await env.theConnection.promises.query('select ? as long_binary', [longBuffer])
    assert.deepStrictEqual(res.first[0].long_binary, longBuffer)
  })

  it('verify buffer longer than column causes error', async function handler () {
    const b = Buffer.from('0102030405060708090a', 'hex')
    await testBoilerPlateAsync('buffer_param_test',
      { buffer_param: 'varbinary(5)' },
      async function handler () {
        await expect(env.theConnection.promises
          .query('INSERT INTO buffer_param_test (buffer_param) VALUES (?)', [b]))
          .to.be.rejectedWith('String or binary data would be truncated')
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

  it('insert string as parameter', async function handler () {
    await insertSelectType('This is a test', 'nvarchar(100)', MetaTypes.nvarchar)
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

  it('insert a bool (true) as a parameter', async function handler () {
    await insertSelectType(true, 'bit', MetaTypes.bool)
  })

  it('insert a bool (false) as a parameter', async function handler () {
    await insertSelectType(false, 'bit', MetaTypes.bool)
  })

  it('insert largest positive int as parameter', async function handler () {
    await insertSelectType(0x7fffffff, 'int', MetaTypes.int)
  })

  it('insert largest bigint as parameter', async function handler () {
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(0x4fffffffffffffff, 'bigint', MetaTypes.bigint)
  })

  it('insert decimal as parameter', async function handler () {
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(3.141593, 'decimal(18,7)', MetaTypes.decimal)
  })

  it('insert decimal as bigint parameter 2', async function handler () {
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(123456789.0, 'bigint', MetaTypes.number)
  })

  it('insert null string as varchar 2', async function handler () {
    await insertSelectType(null, 'varchar(1)', MetaTypes.varchar)
  })

  it('verify js date inserted into date field', async function handler () {
    const utcDate = env.timeHelper.getUTCDate()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(utcDate, 'date')
  })

  it('verify js date/time inserted into datetime field', async function handler () {
    const utcDate = env.timeHelper.getUTCDateHHMMSS()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(utcDate, 'datetime')
  })

  it('verify js ancient pre 1970 date/time inserted into datetimeoffset(3) field', async function handler () {
    const utcDate = env.timeHelper.ancientUTCDateHHMMSSMS()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(utcDate, 'datetimeoffset(3)', MetaTypes.datetimeOffset)
  })

  it('verify js midnight date inserted into datetimeoffset(3) field', async function handler () {
    const mid = env.timeHelper.midnightDate()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(mid, 'datetimeoffset(3)', MetaTypes.datetimeOffset)
  })

  it('verify js current UTC date inserted into datetimeoffset(3) field', async function handler () {
    const utcDate = env.timeHelper.getUTCDateTime()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(utcDate, 'datetimeoffset(3)', MetaTypes.datetimeOffset)
  })

  it('verify js current UTC date inserted into datetime field', async function handler () {
    const utcDate = env.timeHelper.getUTCDateHHMMSS()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(utcDate, 'datetime')
  })

  // verify fix for a bug that would return the wrong day when a datetimeoffset was inserted where the date
  // was before 1/1/1970 and the time was midnight.

  it('verify js new year eve date inserted into datetimeoffset(3) field', async function handler () {
    const nye = env.timeHelper.newYearDateEve()
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(nye, 'datetimeoffset(3)', MetaTypes.datetimeOffset)
  })

  it('verify empty string inserted into nvarchar field', async function handler () {
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType('', 'nvarchar(1)')
  })

  it('large string into nvarchar(max)', async function handler () {
    // eslint-disable-next-line no-loss-of-precision
    await insertSelectType(env.repeat('A', 10000), 'nvarchar(max)')
  })

  it('bind a Buffer([0,1,2,3])] to binary', async function handler () {
    const buff = Buffer.from([0, 1, 2, 3])
    const r = await env.theConnection.promises.query('declare @bin binary(4) = ?; select @bin as bin',
      [buff])
    const expected = [{
      bin: buff
    }]
    assert.deepStrictEqual(r.first, expected)
  })

  it('insert string 2 x 1024 * 1024 in varchar(max)', async function handler () {
    await runTestAsync('varchar(max)', 2 * 1024 * 1024)
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
  it('invalid numbers cause errors', async function handler () {
    async function f0 () {
      await env.theConnection.promises.query('INSERT INTO invalid_numbers_test (f) VALUES (?)',
        [Number.POSITIVE_INFINITY])
      assert.deepStrictEqual(1, 0)
    }

    async function f1 () {
      await env.theConnection.promises.query('INSERT INTO invalid_numbers_test (f) VALUES (?)',
        [Number.NEGATIVE_INFINITY])
      assert.deepStrictEqual(1, 0)
    }

    await expect(f0()).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
    await expect(f1()).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
  })
})
