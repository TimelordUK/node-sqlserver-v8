// ---------------------------------------------------------------------------------------------------------------------------------
// File: parameter_binding_tests.js
// Contents: test suite for new NAPI parameter binding system
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

const chai = require('chai')
const assert = chai.assert
const testConnection = require('../common/test-connection')
const sql = require('msnodesqlv8')
sql.setLogLevel(4) // Debug level
sql.enableConsoleLogging(true)

/* globals describe it */

describe('NAPI Parameter Binding', function () {
  this.timeout(60000)

  this.beforeEach(done => {
    env.open().then(() => {
      done()
    }).catch(e => {
      console.error(e)
    })
  })

  this.afterEach(done => {
    env.close().then(() => { done() }).catch(e => {
      console.error(e)
    })
  })

  // Helper functions
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

  // Test basic parameter types
  it('test primitive data types', async function () {
    await testBoilerPlateAsync(
      'primitive_types_test',
      {
        int_val: 'int',
        float_val: 'float',
        string_val: 'nvarchar(100)',
        bit_val: 'bit'
      },
      async function () {
        await env.theConnection.promises.query(`
          INSERT INTO primitive_types_test (int_val, float_val, string_val, bit_val) 
          VALUES (?, ?, ?, ?)`,
        [
          42, // int
          3.14159, // float
          'Hello, World!', // string
          true // boolean
        ]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM primitive_types_test')
        assert.strictEqual(result.first[0].int_val, 42)
        assert.strictEqual(result.first[0].float_val, 3.14159)
        assert.strictEqual(result.first[0].string_val, 'Hello, World!')
        assert.strictEqual(result.first[0].bit_val, true)
      }
    )
  })

  // Test null values
  it('test null values for different types', async function () {
    await testBoilerPlateAsync(
      'null_values_test',
      {
        int_val: 'int',
        float_val: 'float',
        string_val: 'nvarchar(100)',
        bit_val: 'bit'
      },
      async function () {
        await env.theConnection.promises.query(`
          INSERT INTO null_values_test (int_val, float_val, string_val, bit_val) 
          VALUES (?, ?, ?, ?)`,
        [
          null, // int
          null, // float
          null, // string
          null // boolean
        ]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM null_values_test')
        assert.strictEqual(result.first[0].int_val, null)
        assert.strictEqual(result.first[0].float_val, null)
        assert.strictEqual(result.first[0].string_val, null)
        assert.strictEqual(result.first[0].bit_val, null)
      }
    )
  })

  // Test array parameters (bulk binding)
  it('test array parameters with bulk insert', async function () {
    // Skip this test if bulk operations not supported
    if (!env.theConnection.supportsBulk) {
      this.skip()
      return
    }

    await testBoilerPlateAsync(
      'array_params_test',
      {
        int_val: 'int',
        string_val: 'nvarchar(100)'
      },
      async function () {
        // This test assumes your driver supports array parameters for bulk operations
        await env.theConnection.promises.query(`
          INSERT INTO array_params_test (int_val, string_val) 
          VALUES (?, ?)`,
        [
          [1, 2, 3, 4, 5], // array of ints
          ['one', 'two', 'three', 'four', 'five'] // array of strings
        ]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM array_params_test ORDER BY int_val')
        assert.strictEqual(result.first.length, 5)
        assert.strictEqual(result.first[0].int_val, 1)
        assert.strictEqual(result.first[0].string_val, 'one')
        assert.strictEqual(result.first[4].int_val, 5)
        assert.strictEqual(result.first[4].string_val, 'five')
      }
    )
  })

  // Test object parameter with metadata
  it('test object parameter with metadata', async function () {
    await testBoilerPlateAsync(
      'object_params_test',
      {
        value_col: 'int'
      },
      async function () {
        // Create a parameter with metadata
        const param = {
          name: 'param1',
          type_id: env.sql.Types.Int, // Replace with your SQL type constant
          is_output: false,
          precision: 10,
          scale: 0,
          value: 42
        }

        await env.theConnection.promises.query(`
          INSERT INTO object_params_test (value_col) 
          VALUES (?)`,
        [param]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM object_params_test')
        assert.strictEqual(result.first[0].value_col, 42)
      }
    )
  })

  // Test binary data
  it('test binary data parameters', async function () {
    await testBoilerPlateAsync(
      'binary_params_test',
      {
        binary_col: 'varbinary(100)'
      },
      async function () {
        const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05])
        await env.theConnection.promises.query(`
          INSERT INTO binary_params_test (binary_col) 
          VALUES (?)`,
        [binaryData]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM binary_params_test')
        assert.deepStrictEqual(result.first[0].binary_col, Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]))
      }
    )
  })

  // Test date/time parameters
  it('test date/time parameters', async function () {
    await testBoilerPlateAsync(
      'datetime_params_test',
      {
        date_col: 'date',
        datetime_col: 'datetime',
        datetimeoffset_col: 'datetimeoffset'
      },
      async function () {
        const testDate = new Date('2023-05-15T12:30:45.123Z')
        await env.theConnection.promises.query(`
          INSERT INTO datetime_params_test (date_col, datetime_col, datetimeoffset_col) 
          VALUES (?, ?, ?)`,
        [testDate, testDate, testDate]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM datetime_params_test')
        // Note: Exact comparison might fail due to precision differences
        assert.ok(result.first[0].date_col instanceof Date)
        assert.ok(result.first[0].datetime_col instanceof Date)
        assert.ok(result.first[0].datetimeoffset_col instanceof Date)

        // Check date portion only for date_col
        const dateCol = result.first[0].date_col
        assert.strictEqual(dateCol.getUTCFullYear(), 2023)
        assert.strictEqual(dateCol.getUTCMonth(), 4) // 0-based month
        assert.strictEqual(dateCol.getUTCDate(), 15)
      }
    )
  })

  // Test output parameters
  it('test output parameters', async function () {
    // Create a parameter with output flag
    const outputParam = {
      name: 'output_param',
      type_id: env.sql.Types.Int, // Replace with your SQL type constant
      is_output: true,
      precision: 10,
      scale: 0,
      value: 0 // Initial value
    }

    const result = await env.theConnection.promises.query(`
      DECLARE @out_val INT = 42;
      SELECT @out_val AS result;
      SET ? = @out_val;
    `, [outputParam])

    // Check that the value was returned as both result and output parameter
    assert.strictEqual(result.first[0].result, 42)
    // Check that the output parameter was updated
    // Note: This assumes your driver will update the parameter object
    // The exact implementation might vary
    assert.strictEqual(outputParam.value, 42)
  })

  // Test large values
  it('test large string parameter', async function () {
    await testBoilerPlateAsync(
      'large_string_test',
      {
        large_text: 'nvarchar(max)'
      },
      async function () {
        // Create a large string
        const largeString = 'A'.repeat(100000)
        await env.theConnection.promises.query(`
          INSERT INTO large_string_test (large_text) 
          VALUES (?)`,
        [largeString]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT LEN(large_text) AS text_length FROM large_string_test')
        assert.strictEqual(result.first[0].text_length, 100000)
      }
    )
  })

  // Test edge cases
  it('test extreme numeric values', async function () {
    await testBoilerPlateAsync(
      'extreme_nums_test',
      {
        int_col: 'int',
        bigint_col: 'bigint',
        float_col: 'float'
      },
      async function () {
        await env.theConnection.promises.query(`
          INSERT INTO extreme_nums_test (int_col, bigint_col, float_col) 
          VALUES (?, ?, ?)`,
        [
          2147483647, // Max int32
          9007199254740991, // Max safe integer in JavaScript
          1.7976931348623157e+308 // Very large float
        ]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM extreme_nums_test')
        assert.strictEqual(result.first[0].int_col, 2147483647)
        assert.strictEqual(result.first[0].bigint_col, 9007199254740991)
        assert.strictEqual(result.first[0].float_col, 1.7976931348623157e+308)
      }
    )
  })

  // Test error handling
  it('test invalid parameter throws appropriate error', async function () {
    // Attempt to pass infinity which should fail
    await expect(
      env.theConnection.promises.query('SELECT ? AS result', [Number.POSITIVE_INFINITY])
    ).to.be.rejected
  })

  // Test mix of parameter types in one query
  it('test mixed parameter types', async function () {
    await testBoilerPlateAsync(
      'mixed_params_test',
      {
        int_col: 'int',
        string_col: 'nvarchar(100)',
        binary_col: 'varbinary(100)',
        date_col: 'datetime'
      },
      async function () {
        const testDate = new Date('2023-05-15T12:30:45.123Z')
        const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05])

        await env.theConnection.promises.query(`
          INSERT INTO mixed_params_test (int_col, string_col, binary_col, date_col) 
          VALUES (?, ?, ?, ?)`,
        [
          42, // int
          'Mixed Test', // string
          binaryData, // binary
          testDate // date
        ]
        )
      },
      async function () {
        const result = await env.theConnection.promises.query('SELECT * FROM mixed_params_test')
        assert.strictEqual(result.first[0].int_col, 42)
        assert.strictEqual(result.first[0].string_col, 'Mixed Test')
        assert.deepStrictEqual(result.first[0].binary_col, Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]))
        assert.ok(result.first[0].date_col instanceof Date)
      }
    )
  })

  // Test with prepared statements (if supported)
  it('test parameters with prepared statement', async function () {
    if (!env.theConnection.supportsPrepare) {
      this.skip()
      return
    }

    const prepared = await env.theConnection.promises.prepare(`
      SELECT @p1 AS int_param, @p2 AS string_param, @p3 AS bit_param
    `)

    const result = await prepared.promises.query({
      p1: 42,
      p2: 'Prepared statement',
      p3: true
    })

    assert.strictEqual(result.first[0].int_param, 42)
    assert.strictEqual(result.first[0].string_param, 'Prepared statement')
    assert.strictEqual(result.first[0].bit_param, true)

    await prepared.promises.unprepare()
  })
})
