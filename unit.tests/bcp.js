'use strict'
/* global suite teardown teardown test setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')
const util = require('util')

suite('bcp', function () {
  let theConnection
  this.timeout(100000)
  let connStr
  let helper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === null || err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert(err === null || err === false || err === undefined)
      done()
    })
  })

  class BulkTableTest {
    constructor (c, def) {
      function where (list, primitive) {
        return list.reduce((agg, latest) => {
          if (primitive(latest)) {
            agg.push(latest)
          }
          return agg
        }, [])
      }
      const tableName = def.tableName
      const columns = def.columns.map(e => `${e.name} ${e.type}`).join(', ')
      const insertColumnNames = where(def.columns, c => {
        const res = !c.type.includes('identity')
        return res
      }).map(e => `${e.name}`).join(', ')
      const columnNames = def.columns.map(e => `${e.name}`).join(', ')
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
      const createTableSql = `CREATE TABLE ${tableName} (${columns})`
      const clusteredSql = `CREATE CLUSTERED INDEX IX_${tableName} ON ${tableName}(id)`
      const insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
      const selectSql = `SELECT ${columnNames} FROM ${tableName}`
      const trucateSql = `TRUNCATE TABLE ${tableName}`
      const paramsSql = `(${def.columns.map(_ => '?').join(', ')})`

      this.definition = def
      this.theConnection = c
      this.dropTableSql = dropTableSql
      this.createTableSql = createTableSql
      this.clusteredSql = clusteredSql
      this.selectSql = selectSql
      this.insertSql = insertSql
      this.truncateSql = trucateSql
      this.tableName = def.tableName
      this.paramsSql = paramsSql
      this.insertParamsSql = `${insertSql} ${paramsSql}`
    }

    async create () {
      const promisedQuery = util.promisify(theConnection.query)
      const tm = theConnection.tableMgr()
      const promisedGetTable = util.promisify(tm.getTable)
      await promisedQuery(this.dropTableSql)
      await promisedQuery(this.createTableSql)
      const table = await promisedGetTable(this.tableName)
      return table
    }
  }

  class BcpEntry {
    constructor (definition, factory, tester) {
      this.definition = definition
      this.factory = factory
      this.tester = tester
    }

    async runner (count) {
      const helper = new BulkTableTest(theConnection, this.definition)
      const expected = []
      const rows = count || 5000
      for (let i = 0; i < rows; ++i) {
        expected.push(this.factory(i))
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        await promisedInsert(expected)
        const res = await promisedQuery(`select count(*) as rows from ${this.definition.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
        const top = await promisedQuery(`select top 100 * from ${this.definition.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
        const toCheck = expected.slice(0, 100)
        if (this.tester) {
          this.tester(top, toCheck)
        } else {
          assert.deepStrictEqual(top, toCheck)
        }
      } catch (e) {
        return e
      }
      return null
    }
  }

  function repeat (c, num) {
    return new Array(num + 1).join(c)
  }

  function parseTime (ds) {
    const [hours, minutes, seconds] = ds.split(':') // Using ES6 destructuring
    // var time = "18:19:02".split(':'); // "Old" ES5 version
    const d = new Date()
    d.setHours(+hours) // Set the hours, using implicit type coercion
    d.setMinutes(minutes) // You can pass Number or String. It doesn't really matter
    d.setSeconds(seconds)
    d.setMilliseconds(0)
    return d
  }

  test('bcp real with null', testDone => {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'r1',
            type: 'real'
          }]
      }, i => {
        return {
          id: i,
          r1: i % 2 === 0 ? null : get(i) * 2
        }
      }, (actual, expected) => {
        assert.deepStrictEqual(actual.length, expected.length)
        for (let i = 0; i < actual.length; ++i) {
          const lhs = actual[i]
          const rhs = expected[i]
          assert.deepStrictEqual(lhs.id, rhs.id)
          assert(Math.abs(lhs.r1 - rhs.r1) < 1e-5)
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp real', testDone => {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'r1',
            type: 'real'
          }]
      }, i => {
        return {
          id: i,
          r1: i % 2 === 0 ? get(i) : get(i) * 2
        }
      }, (actual, expected) => {
        assert.deepStrictEqual(actual.length, expected.length)
        for (let i = 0; i < actual.length; ++i) {
          const lhs = actual[i]
          const rhs = expected[i]
          assert.deepStrictEqual(lhs.id, rhs.id)
          assert(Math.abs(lhs.r1 - rhs.r1) < 1e-5)
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp bigint with nulls', testDone => {
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'n1',
            type: 'bigint'
          }]
      }, i => {
        return {
          id: i,
          n1: i % 2 === 0 ? null : Math.pow(2, 40) - i
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp bigint', testDone => {
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'n1',
            type: 'bigint'
          }]
      }, i => {
        return {
          id: i,
          n1: i % 2 === 0 ? Math.pow(2, 40) + i : Math.pow(2, 40) - i
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp time', testDone => {
    const testDate = parseTime('16:47:04')
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 't1',
            type: 'time'
          }]
      }, i => {
        return {
          id: i,
          t1: testDate
        }
      }, (actual, expected) => {
        assert.deepStrictEqual(actual.length, expected.length)
        actual.forEach(a => {
          const today = new Date()
          const h = a.t1.getHours()
          const m = a.t1.getMinutes()
          const s = a.t1.getSeconds()
          today.setHours(h)
          today.setMinutes(m)
          today.setSeconds(s)
          today.setMilliseconds(0)
          a.t1 = today
        })
        assert.deepStrictEqual(actual, expected)
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp numeric', testDone => {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'n1',
            type: 'numeric(18,6)'
          }]
      }, i => {
        return {
          id: i,
          n1: i % 2 === 0 ? get(i) : get(i) * 16
        }
      }, (actual, expected) => {
        assert.deepStrictEqual(actual.length, expected.length)
        for (let i = 0; i < actual.length; ++i) {
          const lhs = actual[i]
          const rhs = expected[i]
          assert.deepStrictEqual(lhs.id, rhs.id)
          assert(Math.abs(lhs.n1 - rhs.n1) < 1e-5)
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar(max) (10k chars)', testDone => {
    const rows = 150
    const length = 10 * 1000
    async function test () {
      const b = repeat('z', length)
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 's1',
            type: 'VARCHAR (max) NULL'
          }]
      }, i => {
        return {
          id: i,
          s1: `${b}`
        }
      })
      return await bcp.runner(rows)
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp datetimeoffset datetimeoffset - mix with nulls', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'd1',
            type: 'datetimeoffset'
          },
          {
            name: 'd2',
            type: 'datetimeoffset'
          }]
      }, i => {
        return {
          id: i,
          d1: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp datetimeoffset datetimeoffset', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'd1',
            type: 'datetimeoffset'
          },
          {
            name: 'd2',
            type: 'datetimeoffset'
          }]
      }, i => {
        return {
          id: i,
          d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp binary binary - mix with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'varbinary(10)'
          },
          {
            name: 'b2',
            type: 'varbinary(10)'
          }]
      }, i => {
        return {
          id: i,
          b1: i % 2 === 0 ? null : Buffer.from('0102030405060708090a', 'hex'),
          b2: i % 3 === 0 ? null : Buffer.from('0102030405060708090a', 'hex')
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp binary binary', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'varbinary(10)'
          },
          {
            name: 'b2',
            type: 'varbinary(10)'
          }]
      }, i => {
        return {
          id: i,
          b1: Buffer.from('0102030405060708090a', 'hex'),
          b2: Buffer.from('0102030405060708090a', 'hex')
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp bit bit - mix with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'bit'
          },
          {
            name: 'b2',
            type: 'bit'
          }]
      }, i => {
        return {
          id: i,
          b1: i % 2 === 0 ? null : i % 3 === 0,
          b2: i % 3 === 0 ? null : i % 5 === 0
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp bit bit', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'bit'
          },
          {
            name: 'b2',
            type: 'bit'
          }]
      }, i => {
        return {
          id: i,
          b1: i % 2 === 0,
          b2: i % 3 === 0
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp timestamp timestamp - mix with nulls', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'd1',
            type: 'datetime'
          },
          {
            name: 'd2',
            type: 'datetime'
          }]
      }, i => {
        return {
          id: i,
          d1: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp timestamp timestamp - no null', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'd1',
            type: 'datetime'
          },
          {
            name: 'd2',
            type: 'datetime'
          }]
      }, i => {
        return {
          id: i,
          d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar varchar with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 's1',
            type: 'VARCHAR (255) NULL'
          },
          {
            name: 's2',
            type: 'VARCHAR (100) NULL'
          }]
      }, i => {
        return {
          id: i,
          s1: i % 2 === 0 ? null : `column1${i}`,
          s2: `testing${i + 1}2Data`
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar varchar', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 's1',
            type: 'VARCHAR (255)'
          },
          {
            name: 's2',
            type: 'VARCHAR (100)'
          }]
      }, i => {
        return {
          id: i,
          s1: i % 2 === 0 ? null : `column1${i}`,
          s2: `testing${i + 1}2Data`
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column - with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'val',
            type: 'INT'
          }
        ]
      }, i => {
        return {
          id: i,
          val: i % 2 === 0 ? null : i * 2
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'val',
            type: 'INT'
          }
        ]
      }, i => {
        return {
          id: i,
          val: i * 2
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })
})
