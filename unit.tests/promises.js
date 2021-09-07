

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

  test('use query aggregator to drop, create, insert, select, drop', testDone => {
    async function test () {
      try {
        const sql = `if exists(select * from information_schema.tables
            where table_name = 'rowsAffectedTest' and TABLE_SCHEMA='dbo')
                drop table rowsAffectedTest;
            print('create table');
            create table rowsAffectedTest (id int, val int);
            print('insert table')
            insert into rowsAffectedTest values (1, 5);
            print('select table')
            select * from rowsAffectedTest;
            print('drop table')
            drop table rowsAffectedTest;`

        const res = await theConnection.promises.query(sql)
        assert(res !== null)
        assert.deepStrictEqual(res.info.length, 4)
        assert.deepStrictEqual(res.info[0], 'create table')
        assert.deepStrictEqual(res.info[1], 'insert table')
        assert.deepStrictEqual(res.info[2], 'select table')
        assert.deepStrictEqual(res.info[3], 'drop table')
      } catch (e) {
        return e
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
