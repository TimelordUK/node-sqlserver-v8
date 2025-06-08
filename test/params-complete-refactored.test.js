// ---------------------------------------------------------------------------------------------------------------------------------
// File: params-complete-refactored.test.js
// Contents: Complete refactored test suite for parameters (all 62 tests)
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
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

/* globals describe it */

describe('Parameter Tests', function () {
  this.timeout(60000)

  // ========================================
  // TEST DATA DEFINITIONS
  // ========================================

  const TestData = {
    integers: {
      maxNegative: -0x80000000, // -2147483648
      maxPositive: 0x7fffffff, // 2147483647
      bigInt: 0x4fffffffffffffff,
      standardBigInt: 0x80000000,
      decimalAsBigInt: 123456789.0
    },

    strings: {
      empty: '',
      singleChar: 'p',
      swedish: 'åäö',
      ascii: 'a',
      testString: 'This is a test',
      hello: 'hello',
      longString: (length) => 'A'.repeat(length),
      repeatedChar: (char, times) => char.repeat(times),
      ones: (length) => '1'.repeat(length)
    },

    numbers: {
      decimal: 3.141593,
      maxValue: Number.MAX_VALUE,
      minValue: -Number.MAX_VALUE,
      variantDecimal: 11.77,
      variantInt: 10000,
      positiveInfinity: Number.POSITIVE_INFINITY,
      negativeInfinity: Number.NEGATIVE_INFINITY,
      numericStrings: {
        decimal: '12345678.876',
        negative: '-12345678',
        bigNumeric: '1234567891',
        bigInt: '9223372036854775807'
      }
    },

    buffers: {
      hex: Buffer.from('0102030405060708090a', 'hex'),
      bytes: Buffer.from([0, 1, 2, 3]),
      fromString: (str) => Buffer.from(str)
    },

    booleans: {
      trueValue: true,
      falseValue: false,
      trueString: 'true',
      falseString: 'false'
    },

    nullValues: {
      null: null,
      sqlNull: null
    }
  }

  // ========================================
  // COLUMN TYPE DEFINITIONS
  // ========================================

  const ColumnTypes = {
    int: 'int',
    bigint: 'bigint',
    decimal: 'decimal(18,7)',
    float: 'float',
    varchar: 'varchar(100)',
    varchar1: 'varchar(1)',
    nvarchar: 'nvarchar(100)',
    nvarchar50: 'nvarchar(50)',
    nvarchar1000: 'nvarchar(1000)',
    nchar100: 'nchar(100)',
    varcharMax: 'varchar(max)',
    nvarcharMax: 'nvarchar(max)',
    varchar8000: 'varchar(8000)',
    varbinary: 'varbinary(100)',
    varbinary5: 'varbinary(5)',
    binary4: 'binary(4)',
    bit: 'bit',
    date: 'date',
    datetime: 'datetime',
    datetimeoffset: 'datetimeoffset',
    datetimeoffset3: 'datetimeoffset(3)'
  }

  // ========================================
  // EXPECTED METADATA DEFINITIONS
  // ========================================

  const ExpectedMetadata = {
    int: [{
      name: 'int_test',
      size: 10,
      nullable: true,
      type: 'number',
      sqlType: 'int'
    }],

    bigint: [{
      name: 'bigint_test',
      size: 19,
      nullable: true,
      type: 'number',
      sqlType: 'bigint'
    }],

    decimal: [{
      name: 'decimal_test',
      size: 18,
      nullable: true,
      type: 'number',
      sqlType: 'decimal'
    }],

    number: [{
      name: 'bigint_test',
      size: 19,
      nullable: true,
      type: 'number',
      sqlType: 'bigint'
    }],

    datetimeOffset: [{
      name: 'datetimeoffset_test',
      size: 30,
      nullable: true,
      type: 'date',
      sqlType: 'datetimeoffset'
    }],

    bool: [{
      name: 'bit_test',
      size: 1,
      nullable: true,
      type: 'boolean',
      sqlType: 'bit'
    }],

    nvarchar: [{
      name: 'nvarchar_test',
      size: 100,
      nullable: true,
      type: 'text',
      sqlType: 'nvarchar'
    }],

    varchar: [{
      name: 'varchar_test',
      size: 1,
      nullable: true,
      type: 'text',
      sqlType: 'varchar'
    }],

    float: [{
      name: 'f',
      size: 53,
      nullable: true,
      type: 'number',
      sqlType: 'float'
    }]
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  const TestHelpers = {
    /**
     * Creates a test table with specified columns
     * @param {string} tableName - Name of the table to create
     * @param {Object} columnDefinitions - Column name to type mapping
     */
    async createTestTable (tableName, columnDefinitions) {
      const fieldsSql = Object.keys(columnDefinitions)
        .map(field => `${field} ${columnDefinitions[field]}`)
      const tableFieldsSql = `(id int identity, ${fieldsSql.join(', ')})`
      const promises = env.theConnection.promises

      await promises.query(env.dropTableSql(tableName))
      await promises.query(`CREATE TABLE ${tableName}${tableFieldsSql}`)

      const clusteredIndexSql = [
        'CREATE CLUSTERED INDEX IX_', tableName,
        ' ON ', tableName, ' (id)'
      ].join('')
      await promises.query(clusteredIndexSql)
    },

    /**
     * Generic test pattern: create table, insert value, verify value and metadata
     * @param {*} value - Value to insert and verify
     * @param {string} sqlType - SQL column type
     * @param {Array} expectedMetadata - Optional expected metadata
     */
    async insertAndVerifyValue (value, sqlType, expectedMetadata = null) {
      const columnName = `${sqlType.split('(')[0]}_test`
      const tableName = `${columnName}_table`

      await this.createTestTable(tableName, { [columnName]: sqlType })

      // Insert the value
      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (${columnName}) VALUES (?)`,
        [value]
      )

      // Verify the value
      const result = await env.theConnection.promises.query(
        `SELECT ${columnName} FROM ${tableName}`,
        [],
        { raw: true }
      )

      const actualValue = result.first[0][0]

      // Handle date comparisons
      if (actualValue instanceof Date && value instanceof Date) {
        delete actualValue.nanosecondsDelta
        expect(actualValue.toISOString()).to.equal(value.toISOString())
      } else {
        expect(actualValue).to.deep.equal(value)
      }

      // Verify metadata if provided
      if (expectedMetadata) {
        expect(result.meta[0]).to.deep.equal(expectedMetadata)
      }
    },

    /**
     * Tests string insertion with length verification
     * @param {number} length - Length of string to test
     * @param {string} columnType - SQL column type
     */
    async testStringInsertion (length, columnType) {
      const tableName = 'string_length_test'
      const columnName = 'test_string'
      const testString = TestData.strings.longString(length)

      await this.createTestTable(tableName, { [columnName]: columnType })

      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (${columnName}) VALUES (?)`,
        [testString]
      )

      const result = await env.theConnection.promises.query(
        `SELECT ${columnName} FROM ${tableName}`
      )

      assert.strictEqual(result.first[0][columnName].length, length)
    },

    /**
     * Generic boilerplate test pattern used by legacy tests
     * @param {string} tableName - Table name
     * @param {Object} tableFields - Column definitions
     * @param {Function} insertFunction - Insert logic
     * @param {Function} verifyFunction - Verification logic
     */
    async testBoilerPlate (tableName, tableFields, insertFunction, verifyFunction) {
      const fieldsSql = Object.keys(tableFields).map(field => `${field} ${tableFields[field]}`)
      const tableFieldsSql = `(id int identity, ${fieldsSql.join(', ')})`
      const promises = env.theConnection.promises

      await promises.query(env.dropTableSql(tableName))
      await promises.query(`CREATE TABLE ${tableName}${tableFieldsSql}`)

      const clusteredIndexSql = [
        'CREATE CLUSTERED INDEX IX_', tableName,
        ' ON ', tableName, ' (id)'
      ].join('')
      await promises.query(clusteredIndexSql)

      if (insertFunction) await insertFunction()
      if (verifyFunction) await verifyFunction()
    }
  }

  // ========================================
  // TEST SETUP AND TEARDOWN
  // ========================================

  this.beforeEach(async function () {
    sql.logger.info('Starting test setup', 'params.test.beforeEach')
    await env.open()
    sql.logger.info('Test environment opened successfully', 'params.test.beforeEach')
  })

  this.afterEach(async function () {
    sql.logger.info('Starting test cleanup', 'params.test.afterEach')
    await env.close()
    sql.logger.info('Test environment closed successfully', 'params.test.afterEach')
  })

  // ========================================
  // INTEGER PARAMETER TESTS
  // ========================================

  describe('Integer Parameters', function () {
    it('should handle largest negative int (-2147483648)', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.integers.maxNegative,
        ColumnTypes.int,
        ExpectedMetadata.int
      )
    })

    it('should handle largest positive int (2147483647)', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.integers.maxPositive,
        ColumnTypes.int,
        ExpectedMetadata.int
      )
    })

    it('should handle bigint values (0x80000000)', async function () {
      const tableName = 'test_bigint'
      await TestHelpers.testBoilerPlate(
        tableName,
        { bigint_test: ColumnTypes.bigint },
        async function () {
          await env.theConnection.promises.query(
            `INSERT INTO ${tableName} VALUES (?)`,
            [TestData.integers.standardBigInt]
          )
        },
        async function () {
          const result = await env.theConnection.promises.query(
            `SELECT bigint_test FROM ${tableName}`,
            [],
            { raw: true }
          )
          const expected = [[TestData.integers.standardBigInt]]
          assert.deepStrictEqual(expected, result.first)
          assert.deepStrictEqual(ExpectedMetadata.bigint, result.meta[0])
        }
      )
    })

    it('should handle largest bigint as parameter', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.integers.bigInt,
        ColumnTypes.bigint,
        ExpectedMetadata.bigint
      )
    })

    it('should handle decimal as bigint parameter', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.integers.decimalAsBigInt,
        ColumnTypes.bigint,
        ExpectedMetadata.number
      )
    })
  })

  // ========================================
  // DECIMAL/FLOAT PARAMETER TESTS
  // ========================================

  describe('Decimal and Float Parameters', function () {
    it('should handle decimal values', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.numbers.decimal,
        ColumnTypes.decimal,
        ExpectedMetadata.decimal
      )
    })

    it('should handle maximum and minimum number values', async function () {
      await TestHelpers.testBoilerPlate(
        'minmax_test',
        { f: ColumnTypes.float },
        async function () {
          const promises = env.theConnection.promises
          const sql = 'INSERT INTO minmax_test (f) VALUES (?)'
          await promises.query(sql, [TestData.numbers.maxValue])
          await promises.query(sql, [TestData.numbers.minValue])
        },
        async function () {
          const result = await env.theConnection.promises.query(
            'SELECT f FROM minmax_test order by id',
            [],
            { raw: true }
          )
          const expected = [
            [TestData.numbers.maxValue],
            [TestData.numbers.minValue]
          ]
          assert.deepStrictEqual(expected, result.first)
          assert.deepStrictEqual(ExpectedMetadata.float, result.meta[0])
        }
      )
    })
  })

  // ========================================
  // STRING PARAMETER TESTS
  // ========================================

  describe('String Parameters', function () {
    it('should handle empty strings', async function () {
      const result = await env.theConnection.promises.query(
        'declare @s NVARCHAR(MAX) = ?; select @s as data',
        [TestData.strings.empty]
      )
      expect(result.first[0].data).to.equal('')
    })

    it('should handle single character strings', async function () {
      const result = await env.theConnection.promises.query(
        'declare @s NVARCHAR(MAX) = ?; select @s as data',
        [TestData.strings.singleChar]
      )
      expect(result.first[0].data).to.equal(TestData.strings.singleChar)
    })

    it('should handle basic string as parameter', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.strings.testString,
        ColumnTypes.nvarchar,
        ExpectedMetadata.nvarchar
      )
    })

    it('should handle empty string inserted into nvarchar field', async function () {
      await TestHelpers.insertAndVerifyValue(TestData.strings.empty, ColumnTypes.nvarchar1000)
    })

    it('should handle large string into nvarchar(max)', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.strings.longString(10000),
        ColumnTypes.nvarcharMax
      )
    })

    describe('Swedish Character Handling (åäö)', function () {
      it('should handle Swedish chars as SQL literal (no params)', async function () {
        const str = TestData.strings.repeatedChar(TestData.strings.swedish, 10)
        const result = await env.theConnection.promises.query(`select '${str}' as data`)
        assert.deepStrictEqual(result.first[0].data, str)
      })

      it('should handle Swedish chars as parameter', async function () {
        const str = TestData.strings.repeatedChar(TestData.strings.swedish, 10)
        const result = await env.theConnection.promises.query(
          'declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS data',
          [str]
        )
        assert.deepStrictEqual(result.first[0].data, str)
      })

      it('should handle Swedish chars in insert/query', async function () {
        const str = TestData.strings.repeatedChar(TestData.strings.swedish, 5)
        const tableName = 'test_swedish_insert'

        await TestHelpers.testBoilerPlate(
          tableName,
          { text_col: ColumnTypes.nvarchar50 },
          async function () {
            await env.theConnection.promises.query(
              `INSERT INTO ${tableName} (text_col) VALUES (?)`,
              [str]
            )
          },
          async function () {
            const result = await env.theConnection.promises.query(
              `SELECT text_col FROM ${tableName}`
            )
            assert.deepStrictEqual(result.first[0].text_col, str)
          }
        )
      })
    })

    it('should handle ASCII chars as SQL literal (no params)', async function () {
      const str = TestData.strings.repeatedChar(TestData.strings.ascii, 10)
      const result = await env.theConnection.promises.query(`select '${str}' as data`)
      assert.deepStrictEqual(result.first[0].data, str)
    })

    it('should handle long SQL string parameter', async function () {
      const str = TestData.strings.ones(2001)
      const result = await env.theConnection.promises.query(
        'declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS data',
        [str]
      )
      const expected = [{ data: str }]
      assert.deepStrictEqual(result.first, expected)
    })

    describe('String Length Boundaries', function () {
      const stringLengthTests = [
        { length: 100, type: ColumnTypes.nchar100 },
        { length: 500, type: ColumnTypes.nvarchar1000 },
        { length: 1000, type: ColumnTypes.varcharMax },
        { length: 4001, type: ColumnTypes.varcharMax },
        { length: 3999, type: ColumnTypes.varcharMax },
        { length: 4 * 1000, type: ColumnTypes.varcharMax },
        { length: 4 * 1024, type: ColumnTypes.varchar8000 },
        { length: 6 * 1024, type: ColumnTypes.varchar8000 },
        { length: 30 * 1024, type: ColumnTypes.varcharMax },
        { length: 60 * 1024, type: ColumnTypes.varcharMax },
        { length: 2 * 1024 * 1024, type: ColumnTypes.varcharMax }
      ]

      stringLengthTests.forEach(({ length, type }) => {
        it(`should handle ${length} character string in ${type}`, async function () {
          await TestHelpers.testStringInsertion(length, type)
        })
      })
    })

    it('should handle long string using promise', async function () {
      const longString = TestData.strings.repeatedChar('a', 50000)
      const result = await env.theConnection.promises.query(
        'select ? as long_string',
        [longString]
      )
      assert.deepStrictEqual(result.first[0].long_string, longString)
    })

    it('should handle long string using streaming - ensure no fragmentation', function (testDone) {
      const longString = TestData.strings.repeatedChar('a', 40 * 1024)
      const expected = [{ long_string: longString }]
      const res = []
      const colNames = []

      const query = env.theConnection.query(
        'declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS long_string',
        [longString]
      )

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
  })

  // ========================================
  // BOOLEAN PARAMETER TESTS
  // ========================================

  describe('Boolean Parameters', function () {
    it('should handle true values', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.booleans.trueValue,
        ColumnTypes.bit,
        ExpectedMetadata.bool
      )
    })

    it('should handle false values', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.booleans.falseValue,
        ColumnTypes.bit,
        ExpectedMetadata.bool
      )
    })
  })

  // ========================================
  // BUFFER PARAMETER TESTS
  // ========================================

  describe('Buffer Parameters', function () {
    it('should handle Buffer objects as input parameters', async function () {
      await TestHelpers.testBoilerPlate(
        'buffer_param_test',
        { buffer_param: ColumnTypes.varbinary },
        async function () {
          await env.theConnection.promises.query(
            'INSERT INTO buffer_param_test (buffer_param) VALUES (?)',
            [TestData.buffers.hex]
          )
        },
        async function () {
          const result = await env.theConnection.promises.query(
            'SELECT buffer_param FROM buffer_param_test WHERE buffer_param = ?',
            [TestData.buffers.hex]
          )
          assert.deepStrictEqual(result.first.length, 1)
          assert.deepStrictEqual(result.first[0].buffer_param, TestData.buffers.hex)
        }
      )
    })

    it('should handle specific byte sequences ([0,1,2,3])', async function () {
      const result = await env.theConnection.promises.query(
        'declare @bin binary(4) = ?; select @bin as bin',
        [TestData.buffers.bytes]
      )
      const expected = [{ bin: TestData.buffers.bytes }]
      assert.deepStrictEqual(result.first, expected)
    })

    it('should handle long buffer using callback', async function () {
      const longString = TestData.strings.repeatedChar('a', 50000)
      const longBuffer = TestData.buffers.fromString(longString)
      const result = await env.theConnection.promises.query(
        'select ? as long_binary',
        [longBuffer]
      )
      assert.deepStrictEqual(result.first[0].long_binary, longBuffer)
    })

    it('should reject buffer longer than column size', async function () {
      await TestHelpers.testBoilerPlate(
        'buffer_param_test',
        { buffer_param: ColumnTypes.varbinary5 },
        async function () {
          await expect(
            env.theConnection.promises.query(
              'INSERT INTO buffer_param_test (buffer_param) VALUES (?)',
              [TestData.buffers.hex]
            )
          ).to.be.rejectedWith('String or binary data would be truncated')
        }
      )
    })
  })

  // ========================================
  // DATE PARAMETER TESTS
  // ========================================

  describe('Date Parameters', function () {
    it('should handle date as parameter', async function () {
      const utcDate = env.timeHelper.getUTCDateHHMMSS()

      await TestHelpers.testBoilerPlate(
        'date_param_test',
        { date_test: ColumnTypes.datetimeoffset },
        async function () {
          await env.theConnection.promises.query(
            'INSERT INTO date_param_test (date_test) VALUES (?)',
            [utcDate]
          )
        },
        async function () {
          const result = await env.theConnection.promises.query(
            'SELECT date_test FROM date_param_test',
            [],
            { raw: true }
          )
          const lhs = utcDate.toISOString()
          const r1c1 = result.first[0][0]
          const rhs = r1c1.toISOString()
          assert.strictEqual(lhs, rhs)
          assert.strictEqual(r1c1.nanosecondsDelta, 0)
        }
      )
    })

    it('should handle JS date inserted into date field', async function () {
      const utcDate = env.timeHelper.getUTCDate()
      await TestHelpers.insertAndVerifyValue(utcDate, ColumnTypes.date)
    })

    it('should handle JS date/time inserted into datetime field', async function () {
      const utcDate = env.timeHelper.getUTCDateHHMMSS()
      await TestHelpers.insertAndVerifyValue(utcDate, ColumnTypes.datetime)
    })

    it('should handle ancient pre-1970 date/time', async function () {
      const utcDate = env.timeHelper.ancientUTCDateHHMMSSMS()
      await TestHelpers.insertAndVerifyValue(
        utcDate,
        ColumnTypes.datetimeoffset3,
        ExpectedMetadata.datetimeOffset
      )
    })

    it('should handle midnight date', async function () {
      const mid = env.timeHelper.midnightDate()
      await TestHelpers.insertAndVerifyValue(
        mid,
        ColumnTypes.datetimeoffset3,
        ExpectedMetadata.datetimeOffset
      )
    })

    it('should handle current UTC date in datetimeoffset(3)', async function () {
      const utcDate = env.timeHelper.getUTCDateTime()
      await TestHelpers.insertAndVerifyValue(
        utcDate,
        ColumnTypes.datetimeoffset3,
        ExpectedMetadata.datetimeOffset
      )
    })

    it('should handle current UTC date in datetime field', async function () {
      const utcDate = env.timeHelper.getUTCDateHHMMSS()
      await TestHelpers.insertAndVerifyValue(utcDate, ColumnTypes.datetime)
    })

    it('should handle new year eve date (pre-1970 midnight edge case)', async function () {
      const nye = env.timeHelper.newYearDateEve()
      await TestHelpers.insertAndVerifyValue(
        nye,
        ColumnTypes.datetimeoffset3,
        ExpectedMetadata.datetimeOffset
      )
    })
  })

  // ========================================
  // NULL PARAMETER TESTS
  // ========================================

  describe('Null Parameters', function () {
    it('should handle null string (sent as null, not empty)', async function () {
      const result = await env.theConnection.promises.query(
        'declare @s NVARCHAR(MAX) = ?; select @s as data',
        [TestData.nullValues.null]
      )
      expect(result.first[0].data).to.be.null
    })

    it('should handle null string as varchar parameter', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.nullValues.null,
        ColumnTypes.varchar1,
        ExpectedMetadata.varchar
      )
    })

    it('should handle null binary using sqlTypes.asVarBinary(null)', async function () {
      const varbinaryParam = env.sql.VarBinary(TestData.nullValues.null)
      const result = await env.theConnection.promises.query(
        'declare @bin binary(4) = ?; select @bin as bin',
        [varbinaryParam]
      )
      const expected = [{ bin: TestData.nullValues.null }]
      assert.deepStrictEqual(result.first, expected)
    })
  })

  // ========================================
  // SQL VARIANT TESTS
  // ========================================

  describe('SQL Variant Tests', function () {
    it('should handle bool (true) to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        `select cast(CAST('${TestData.booleans.trueString}' as bit) as sql_variant) as data;`
      )
      assert.deepStrictEqual(result.first[0].data, TestData.booleans.trueValue)
    })

    it('should handle bool (false) to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        `select cast(CAST('${TestData.booleans.falseString}' as bit) as sql_variant) as data;`
      )
      assert.deepStrictEqual(result.first[0].data, TestData.booleans.falseValue)
    })

    it('should handle varchar to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        `select cast('${TestData.strings.hello}' as sql_variant) as data;`
      )
      assert.deepStrictEqual(result.first[0].data, TestData.strings.hello)
    })

    it('should handle numeric decimal to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        `select cast(${TestData.numbers.variantDecimal} as sql_variant) as data;`
      )
      assert.deepStrictEqual(result.first[0].data, TestData.numbers.variantDecimal)
    })

    it('should handle int to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        `select cast(${TestData.numbers.variantInt} as sql_variant) as data;`
      )
      assert.deepStrictEqual(result.first[0].data, TestData.numbers.variantInt)
    })

    it('should handle getdate to sql_variant', async function () {
      const result = await env.theConnection.promises.query(
        'select cast(getdate() as sql_variant) as data;'
      )
      const date = result.first[0].data
      assert(date instanceof Date)
    })

    it('should handle getdate (datetime) to sql_variant', async function () {
      const smalldt = env.timeHelper.getUTCDateHH(new Date())
      const result = await env.theConnection.promises.query(
        'select cast(convert(datetime, ?) as sql_variant) as data',
        [smalldt]
      )
      let date = result.first[0].data
      assert(date instanceof Date)
      date = env.timeHelper.getUTCDateHH(date)
      assert(smalldt.getYear() === date.getYear())
      assert(smalldt.getMonth() === date.getMonth())
      assert(smalldt.getDay() === date.getDay())
    })
  })

  // ========================================
  // NUMERIC STRING CONFIGURATION TESTS
  // ========================================

  describe('Numeric String Configuration', function () {
    it('should return numeric as string when connection configured', async function () {
      const num = TestData.numbers.numericStrings.decimal
      env.theConnection.setUseNumericString(true)

      const result = await env.theConnection.promises.query(
        `SELECT CAST(${num} AS numeric(11, 3)) as number`
      )

      assert.deepStrictEqual(result.first[0].number, num)
    })

    it('should return negative numeric as string when query configured', async function () {
      const num = TestData.numbers.numericStrings.negative

      const result = await env.theConnection.promises.query({
        query_str: `select ${num} as number`,
        numeric_string: true
      })

      assert.deepStrictEqual(result.first[0].number, num)
    })

    it('should return cast numeric as string when query configured', async function () {
      const num = TestData.numbers.numericStrings.bigNumeric

      const result = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${num} AS numeric(10, 0)) as number`,
        numeric_string: true
      })

      assert.deepStrictEqual(result.first[0].number, num)
    })

    it('should return bigint implicit as string when query configured', async function () {
      const num = TestData.numbers.numericStrings.bigInt

      const result = await env.theConnection.promises.query({
        query_str: `SELECT ${num} as number`,
        numeric_string: true
      })

      assert.deepStrictEqual(result.first[0].number, num)
    })

    it('should return bigint with cast as string when query configured', async function () {
      const num = TestData.numbers.numericStrings.bigInt

      const result = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${num} AS bigint) as number`,
        numeric_string: true
      })

      assert.deepStrictEqual(result.first[0].number, num)
    })
  })

  // ========================================
  // ADVANCED BINDING TESTS
  // ========================================

  describe('Advanced Parameter Binding', function () {
    it('should handle bind via declare and insert', async function () {
      sql.logger.info('TEST START: bind via a declare and insert', 'params.test')

      const tableName = 'tmp_int'
      const tableFieldsSql = '(n1 int, n2 int)'
      const params = [10, 20]
      const promises = env.theConnection.promises

      await promises.query(env.dropTableSql(tableName))
      await promises.query(`CREATE TABLE ${tableName}${tableFieldsSql}`)
      await promises.query(
        'declare @_p0 int = ?, @_p1 int = ?; insert into [tmp_int] ([n1],[n2]) values (@_p0,@_p1)',
        params
      )

      const res = await env.getTableCount(tableName)
      assert.deepStrictEqual(res, 1)

      sql.logger.info('TEST END: bind via a declare and insert', 'params.test')
    })
  })

  // ========================================
  // ERROR HANDLING TESTS
  // ========================================

  describe('Error Handling', function () {
    it('should reject invalid number parameters (positive infinity)', async function () {
      await expect(
        env.theConnection.promises.query(
          'INSERT INTO invalid_numbers_test (f) VALUES (?)',
          [TestData.numbers.positiveInfinity]
        )
      ).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
    })

    it('should reject invalid number parameters (negative infinity)', async function () {
      await expect(
        env.theConnection.promises.query(
          'INSERT INTO invalid_numbers_test (f) VALUES (?)',
          [TestData.numbers.negativeInfinity]
        )
      ).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
    })

    it('should reject non-Buffer object parameter', async function () {
      if (env.isEncryptedConnection()) return

      const o = { field1: 'value1', field2: -1 }

      await TestHelpers.testBoilerPlate(
        'non_buffer_object',
        { object_col: ColumnTypes.varbinary },
        async function () {
          await expect(
            env.theConnection.promises.query(
              'INSERT INTO non_buffer_object (object_col) VALUES (?)',
              [o.field1, o.field2]
            )
          ).to.be.rejectedWith('Implicit conversion from data type nvarchar to varbinary is not allowed')
        }
      )
    })
  })
})
