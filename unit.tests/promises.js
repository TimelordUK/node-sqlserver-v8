'use strict'
/* global suite teardown teardown test setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')

suite('promises', function () {
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
      const promises = theConnection.promises
      await promises.query(this.dropTableSql)
      await promises.query(this.createTableSql)
      const table = await promises.getTable(this.tableName)
      return table
    }
  }

  class ProcTest {
    async create (connStr, def) {
      await sql.promises.query(connStr, this.dropProcedureSql)
      await sql.promises.query(connStr, def)
    }

    constructor (spName) {
      this.dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${spName}'))
  begin drop PROCEDURE ${spName} end `
    }
  }

  test('adhoc proc promise: open call close', testDone => {
    async function exec () {
      try {
        const spName = 'sp_test'
        const def = `create PROCEDURE ${spName} @param VARCHAR(50) 
        AS 
        BEGIN 
         RETURN LEN(@param); 
        END 
        `
        const msg = 'hello world'
        const proc = new ProcTest(spName)
        await proc.create(connStr, def)
        const res = await sql.promises.callProc(connStr, spName, {
          param: msg
        })
        assert(res !== null)
        assert(res.output !== null)
        assert.deepStrictEqual(res.output[0], msg.length)
      } catch (e) {
        return e
      }
    }
    exec().then((e) => {
      testDone(e)
    })
  })

  test('promises for table insert select rows', testDone => {
    const bulkTableDef = {
      tableName: 'test_table_bulk',
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
          name: 's1',
          type: 'VARCHAR (255) NOT NULL'
        },
        {
          name: 's2',
          type: 'VARCHAR (100) NOT NULL'
        },
        {
          name: 's3',
          type: 'VARCHAR (50) NOT NULL'
        },
        {
          name: 's4',
          type: 'VARCHAR (50) NOT NULL'
        }
      ]
    }
    async function runner () {
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = []
      const rows = 3000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          d1: testDate,
          s1: `${i}`,
          s2: `testing${i + 1}2Data`,
          s3: `testing${i + 2}2Data`,
          s4: `testing${i + 3}2Data`
        })
      }
      theConnection.setUseUTC(true)
      const table = await helper.create()
      try {
        await table.promises.insert(expected)
        const res = await table.promises.select(expected)
        res.forEach(a => {
          delete a.d1.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

  test('using promises to open, query, close pool', testDone => {
    async function exec () {
      try {
        const size = 4
        const pool = new sql.Pool({
          connectionString: connStr,
          ceiling: size
        })
        await pool.promises.open()
        const all = Array(size * 2).fill(0).map((_, i) => pool.promises.query(`select ${i} as i, @@SPID as spid`))
        const promised = await Promise.all(all)
        const res = promised.map(r => r.first[0].spid)
        assert(res !== null)
        const set = new Set(res)
        assert.strictEqual(set.size, size)
        await pool.promises.close()
        return null
      } catch (err) {
        return err
      }
    }
    exec().then(res => {
      testDone(res)
    })
  })

  test('adhoc promise: open select close', testDone => {
    async function exec () {
      try {
        const res = await sql.promises.query(connStr, 'select @@SPID as spid')
        assert(res !== null)
        assert(res.first !== null)
        assert(Object.prototype.hasOwnProperty.call(res.first[0], 'spid'))
      } catch (e) {
        return e
      }
    }
    exec().then((e) => {
      testDone(e)
    })
  })

  test('query aggregator: insert 1 valid 1, ivalid table', testDone => {
    async function test () {
      const tableName = 'rowsAffectedTest'
      try {
        const sql = `if exists(select * from information_schema.tables
          where table_name = '${tableName}' and TABLE_SCHEMA='dbo')
              drop table ${tableName};
       create table ${tableName} (id int, val int);
       
       insert into ${tableName} values (1, 5);
       insert into ${tableName} values (2, 10);
       insert into ${tableName} values (3, 20);
       insert into ${tableName} values (4, 30);

       select x from ${tableName};`

        await theConnection.promises.query(sql)
        return new Error('expecting error')
      } catch (e) {
        // we lose 1 count from driver
        const res = e._results
        assert(res !== null)
        assert(res.meta !== null)
        assert.deepStrictEqual(res.errors.length, 1)
        assert.deepStrictEqual(res.meta, [])
        assert.deepStrictEqual(res.results, [])
        // assert.deepStrictEqual(res.counts, expectedCounts)
        return null
      }
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('query aggregator: drop, create, insert, select, drop', testDone => {
    async function test () {
      try {
        const tableName = 'rowsAffectedTest'
        const m1 = `create table ${tableName}`
        const m2 = `insert table ${tableName}`
        const m3 = `select table ${tableName}`
        const m4 = `drop table ${tableName}`
        const sql = `if exists(select * from information_schema.tables
            where table_name = '${tableName}' and TABLE_SCHEMA='dbo')
                drop table ${tableName};
            print('${m1}');
            create table ${tableName} (id int, val int);
            print('${m2}');
            insert into ${tableName} values (1, 5);
            print('${m3}');
            select * from ${tableName};
            print('${m4}');
            drop table ${tableName};`

        const res = await theConnection.promises.query(sql)
        assert(res !== null)
        assert(res.meta !== null)
        assert.deepStrictEqual(res.meta.length, 1)
        const meta0 = res.meta[0]
        assert.deepStrictEqual(meta0[0].name, 'id')
        assert.deepStrictEqual(meta0[1].name, 'val')

        const expectedMessages = [m1, m2, m3, m4]
        assert.deepStrictEqual(res.info.length, 4)
        assert.deepStrictEqual(res.info, expectedMessages)

        assert(res.first !== null)
        assert.deepStrictEqual(res.results.length, 1)
        assert.deepStrictEqual(res.first, [{
          id: 1,
          val: 5
        }])
      } catch (e) {
        return e
      }
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('query aggregator: 4 inserts, 2 updates, 2 updates, update all', testDone => {
    async function test () {
      try {
        const tableName = 'rowsAffectedTest'
        const sql = `if exists(select * from information_schema.tables
          where table_name = '${tableName}' and TABLE_SCHEMA='dbo')
              drop table ${tableName};
       create table ${tableName} (id int, val int);
       insert into ${tableName} values (1, 5);
       insert into ${tableName} values (2, 10);
       insert into ${tableName} values (3, 20);
       insert into ${tableName} values (4, 30);

       update ${tableName} set val = 100  where id in (1, 2);
       update ${tableName} set val = 100  where id in (3, 4);
       update ${tableName} set val = 100  where id in (1, 2, 3, 4);

       drop table ${tableName};`
        const expectedCounts = [1, 1, 1, 1, 2, 2, 4]
        const res = await theConnection.promises.query(sql)
        assert(res !== null)
        assert(res.meta !== null)
        assert.deepStrictEqual(res.meta, [])
        assert.deepStrictEqual(res.results, [])
        assert.deepStrictEqual(res.counts, expectedCounts)
      } catch (e) {
        return e
      }
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('query aggregator: insert into invalid table', testDone => {
    async function test () {
      try {
        const tableName = 'invalidTable'
        const sql = `
        insert into ${tableName} values (1, 5);`

        await theConnection.promises.query(sql)
        return new Error('expecting error')
      } catch (e) {
        assert(e.message.indexOf('Invalid object name \'invalidTable\'') > 0)
        return null
      }
    }
    test().then((e) => {
      testDone(e)
    })
  })
})
