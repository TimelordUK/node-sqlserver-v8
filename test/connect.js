'use strict'

/* globals describe before it */

const path = require('path')
const assert = require('assert')
const supp = require('../samples/typescript/demo-support')
const sql = require('msnodesqlv8')
const { GetConnection } = require(path.join(__dirname, './get-connection'))
const connectionString = new GetConnection().connectionString

describe('connection tests', function () {
  let connStr
  let support
  let helper
  this.timeout(10000)
  let procedureHelper

  before(done => {
    supp.GlobalConn.init(sql, co => {
      connStr = connectionString || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      helper = co.helper
      helper.setVerbose(false)
      done()
    }, connectionString)
  })

  it('connection closes OK in sequence with query', done => {
    sql.open(connStr,
      (err, conn) => {
        const expected = [{
          n: 1
        }]
        assert(err === null || err === false)
        conn.query('SELECT 1 as n', (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, expected)
          conn.close(() => {
            done()
          })
        })
      })
  })
})
