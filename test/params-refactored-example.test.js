// Example of how params.test.js could be refactored for better readability
// This shows patterns that could be applied to the full file

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

const sql = require('../lib/sql')
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)

/* globals describe it */

describe('Parameter Tests', function () {
  this.timeout(60000)

  // Test Data Definitions
  const TestData = {
    integers: {
      maxNegative: -0x80000000,
      maxPositive: 0x7fffffff,
      bigInt: 0x4fffffffffffffff
    },

    strings: {
      empty: '',
      singleChar: 'p',
      swedish: 'åäö',
      longString: (length) => 'A'.repeat(length)
    },

    numbers: {
      decimal: 3.141593,
      maxValue: Number.MAX_VALUE,
      minValue: -Number.MAX_VALUE,
      bigIntAsDecimal: 123456789.0
    },

    buffers: {
      small: Buffer.from('0102030405060708090a', 'hex'),
      bytes: Buffer.from([0, 1, 2, 3])
    }
  }

  // Column Type Definitions
  const ColumnTypes = {
    int: 'int',
    bigint: 'bigint',
    decimal: 'decimal(18,7)',
    varchar: 'varchar(100)',
    nvarchar: 'nvarchar(100)',
    varcharMax: 'varchar(max)',
    nvarcharMax: 'nvarchar(max)',
    varbinary: 'varbinary(100)',
    bit: 'bit',
    datetime: 'datetime',
    datetimeoffset: 'datetimeoffset(3)'
  }

  // Expected Metadata Definitions
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
    }]
  }

  // Helper Functions
  const TestHelpers = {
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
    }
  }

  // Setup and Teardown
  this.beforeEach(async function () {
    await env.open()
  })

  this.afterEach(async function () {
    await env.close()
  })

  // Grouped Tests
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

    it('should handle bigint values', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.integers.bigInt,
        ColumnTypes.bigint,
        ExpectedMetadata.bigint
      )
    })
  })

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

    it('should handle Swedish characters (åäö)', async function () {
      const swedishString = TestData.strings.swedish.repeat(5)
      await TestHelpers.insertAndVerifyValue(swedishString, ColumnTypes.nvarchar)
    })

    describe('String Length Boundaries', function () {
      const testCases = [
        { length: 100, type: 'nchar(100)' },
        { length: 500, type: 'nvarchar(1000)' },
        { length: 1000, type: 'varchar(max)' },
        { length: 4001, type: 'varchar(max)' },
        { length: 4 * 1024, type: 'varchar(8000)' },
        { length: 6 * 1024, type: 'varchar(8000)' },
        { length: 30 * 1024, type: 'varchar(max)' },
        { length: 60 * 1024, type: 'varchar(max)' },
        { length: 2 * 1024 * 1024, type: 'varchar(max)' }
      ]

      testCases.forEach(({ length, type }) => {
        it(`should handle ${length} character string in ${type}`, async function () {
          await TestHelpers.testStringInsertion(length, type)
        })
      })
    })
  })

  describe('Boolean Parameters', function () {
    it('should handle true values', async function () {
      await TestHelpers.insertAndVerifyValue(true, ColumnTypes.bit, ExpectedMetadata.bool)
    })

    it('should handle false values', async function () {
      await TestHelpers.insertAndVerifyValue(false, ColumnTypes.bit, ExpectedMetadata.bool)
    })
  })

  describe('Decimal Parameters', function () {
    it('should handle decimal values', async function () {
      await TestHelpers.insertAndVerifyValue(
        TestData.numbers.decimal,
        ColumnTypes.decimal,
        ExpectedMetadata.decimal
      )
    })

    it('should handle maximum number values', async function () {
      const tableName = 'max_numbers_test'
      await TestHelpers.createTestTable(tableName, { f: 'float' })

      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (f) VALUES (?)`,
        [TestData.numbers.maxValue]
      )
      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (f) VALUES (?)`,
        [TestData.numbers.minValue]
      )

      const result = await env.theConnection.promises.query(
        `SELECT f FROM ${tableName} ORDER BY id`,
        [],
        { raw: true }
      )

      const expected = [
        [TestData.numbers.maxValue],
        [TestData.numbers.minValue]
      ]

      expect(result.first).to.deep.equal(expected)
    })
  })

  describe('Buffer Parameters', function () {
    it('should handle Buffer objects', async function () {
      const tableName = 'buffer_test'
      await TestHelpers.createTestTable(tableName, { buffer_param: ColumnTypes.varbinary })

      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (buffer_param) VALUES (?)`,
        [TestData.buffers.small]
      )

      const result = await env.theConnection.promises.query(
        `SELECT buffer_param FROM ${tableName} WHERE buffer_param = ?`,
        [TestData.buffers.small]
      )

      expect(result.first).to.have.length(1)
      expect(result.first[0].buffer_param).to.deep.equal(TestData.buffers.small)
    })

    it('should handle specific byte sequences', async function () {
      const result = await env.theConnection.promises.query(
        'declare @bin binary(4) = ?; select @bin as bin',
        [TestData.buffers.bytes]
      )

      expect(result.first).to.deep.equal([{ bin: TestData.buffers.bytes }])
    })
  })

  describe('Date Parameters', function () {
    it('should handle current UTC dates', async function () {
      const utcDate = env.timeHelper.getUTCDateHHMMSS()
      const tableName = 'date_test'

      await TestHelpers.createTestTable(tableName, { date_test: ColumnTypes.datetimeoffset })

      await env.theConnection.promises.query(
        `INSERT INTO ${tableName} (date_test) VALUES (?)`,
        [utcDate]
      )

      const result = await env.theConnection.promises.query(
        `SELECT date_test FROM ${tableName}`,
        [],
        { raw: true }
      )

      const returnedDate = result.first[0][0]
      expect(utcDate.toISOString()).to.equal(returnedDate.toISOString())
      expect(returnedDate.nanosecondsDelta).to.equal(0)
    })

    it('should handle ancient dates (pre-1970)', async function () {
      const ancientDate = env.timeHelper.ancientUTCDateHHMMSSMS()
      await TestHelpers.insertAndVerifyValue(ancientDate, ColumnTypes.datetimeoffset)
    })

    it('should handle midnight dates', async function () {
      const midnightDate = env.timeHelper.midnightDate()
      await TestHelpers.insertAndVerifyValue(midnightDate, ColumnTypes.datetimeoffset)
    })
  })

  describe('Null Parameters', function () {
    it('should handle null strings', async function () {
      const result = await env.theConnection.promises.query(
        'declare @s NVARCHAR(MAX) = ?; select @s as data',
        [null]
      )
      expect(result.first[0].data).to.be.null
    })

    it('should handle null binary values', async function () {
      const varbinaryParam = env.sql.VarBinary(null)
      const result = await env.theConnection.promises.query(
        'declare @bin binary(4) = ?; select @bin as bin',
        [varbinaryParam]
      )
      expect(result.first).to.deep.equal([{ bin: null }])
    })
  })

  describe('Error Handling', function () {
    it('should reject invalid number parameters (infinity)', async function () {
      await expect(
        env.theConnection.promises.query(
          'INSERT INTO invalid_numbers_test (f) VALUES (?)',
          [Number.POSITIVE_INFINITY]
        )
      ).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
    })

    it('should reject invalid number parameters (negative infinity)', async function () {
      await expect(
        env.theConnection.promises.query(
          'INSERT INTO invalid_numbers_test (f) VALUES (?)',
          [Number.NEGATIVE_INFINITY]
        )
      ).to.be.rejectedWith('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
    })

    it('should handle buffer length exceeding column size', async function () {
      const tableName = 'buffer_overflow_test'
      await TestHelpers.createTestTable(tableName, { buffer_param: 'varbinary(5)' })

      await expect(
        env.theConnection.promises.query(
          `INSERT INTO ${tableName} (buffer_param) VALUES (?)`,
          [TestData.buffers.small]
        )
      ).to.be.rejectedWith('String or binary data would be truncated')
    })
  })

  describe('Numeric String Configuration', function () {
    it('should return numeric as string when connection configured', async function () {
      const num = '12345678.876'
      env.theConnection.setUseNumericString(true)

      const result = await env.theConnection.promises.query(
        `SELECT CAST(${num} AS numeric(11, 3)) as number`
      )

      expect(result.first[0].number).to.equal(num)
    })

    it('should return bigint as string when query configured', async function () {
      const num = '9223372036854775807'

      const result = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${num} AS bigint) as number`,
        numeric_string: true
      })

      expect(result.first[0].number).to.equal(num)
    })
  })
})
