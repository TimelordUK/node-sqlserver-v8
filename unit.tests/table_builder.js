'use strict'
/* global suite teardown teardown test setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')

suite('table_builder', function () {
  let theConnection
  this.timeout(10000)
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

  test('use table builder to bind to a table int, varchar', testDone => {
    function getVec (c) {
      const d = []
      for (let i = 0; i < c; ++i) {
        d.push({
          id: i,
          col_a: i * 5,
          col_b: `str_${i}`,
          col_c: i + 1,
          col_d: i - 1,
          col_e: `str2_${i}`
        })
      }
      return d
    }
    async function test () {
      try {
        const tableName = 'tmpTableBuilder'
        const mgr = theConnection.tableMgr()
        const builder = mgr.makeBuilder(tableName, 'scratch')

        builder.addColumn('id').asInt().isPrimaryKey(1)
        builder.addColumn('col_a').asInt()
        builder.addColumn('col_b').asVarChar(100)
        builder.addColumn('col_c').asInt()
        builder.addColumn('col_d').asInt()
        builder.addColumn('col_e').asVarChar(100)

        const table = builder.toTable()
        await builder.drop()
        await builder.create()
        const vec = getVec(20)
        await table.promises.insert(vec)
        const keys = vec.map(c => {
          return {
            id: c.id
          }
        })
        const s1 = await table.promises.select(keys)
        assert.deepStrictEqual(vec, s1)
        await builder.drop()
      } catch (e) {
        return e
      }
    }

    test().then((e) => {
      testDone(e)
    })
  })
})
