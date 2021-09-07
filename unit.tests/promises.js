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

  class Employee {
    constructor (tableName) {
      this.tableName = tableName
    }

    dropCreate (name) {
      return new Promise((resolve, reject) => {
        helper.dropCreateTable({
          tableName: name
        }, (e) => {
          if (e) {
            reject(e)
          } else {
            resolve(null)
          }
        })
      })
    }

    async create () {
      const dropTableSql = `IF OBJECT_ID('${this.tableName}', 'U') IS NOT NULL DROP TABLE ${this.tableName};`
      await theConnection.promises.query(dropTableSql)
      await this.dropCreate(this.tableName)
      const table = await theConnection.promises.getTable(this.tableName)
      return table
    }

    createEmployees (count) {
      const parsedJSON = helper.getJSON()
      const res = []
      for (let i = 0; i < count; ++i) {
        const x = helper.cloneEmployee(parsedJSON[i % parsedJSON.length])
        x.BusinessEntityID = i
        res.push(x)
      }
      return res
    }

    async insertSelect (table) {
      const parsedJSON = this.createEmployees(200)
      table.setUseBcp(true)
      const d = new Date()
      await table.promises.insert(parsedJSON)
      console.log(`ms = ${new Date() - d}`)
      const keys = helper.extractKey(parsedJSON, 'BusinessEntityID')
      const results = await table.promises.select(keys)
      assert.deepStrictEqual(results, parsedJSON, 'results didn\'t match')
    }
  }

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
        const sql = `create table ${tableName} (id int, val int);
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

  test('bcp employee', testDone => {
    async function test () {
      try {
        const employee = new Employee('employee')
        const table = await employee.create()
        await employee.insertSelect(table)
      } catch (e) {
        return e
      }
    }
    test().then((e) => {
      testDone(e)
    })
  })
})
