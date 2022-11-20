'use strict'
/* globals describe it */

const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('tvp', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('non dbo schema use tvp simple test type select test', async function handler () {
    const tableName = 'TestSchema.TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    const res = await env.theConnection.promises.query('select * from ?;', [tp])
    expect(res.first).to.deep.equal(vec)
  })

  it('use tvp simple test type insert test extended ascii', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getExtendedVec(8 * 1024)
    const promises = env.theConnection.promises
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    await promises.query('exec insertTestTvp @tvp = ?;', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(vec)
  })

  it('use tvp simple test type insert test long string 8 * 1024', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(8 * 1024)
    const promises = env.theConnection.promises
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    await promises.query('exec insertTestTvp @tvp = ?;', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(vec)
  })

  it('call tvp proc with local table', async function handler () {
    const tableName = 'TestTvp'

    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ],
      [
        {
          Column0: 'Select Complete'
        }
      ]
    ]

    expected[1][0].start_date.nanosecondsDelta = 0
    const helper = env.tvpHelper(tableName)
    await helper.create(tableName)
    const res = await env.theConnection.promises.callProc('localTableProcedure',
      ['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)], {
        replaceEmptyColumnNames: true
      })
    expect(res.results).to.deep.equal(expected)
  })

  it('call tvp proc from proc', async function handler () {
    const tableName = 'TestTvp'
    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          Column0: 'Insert 2 Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        },
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ]
    ]

    expected[2][0].start_date.nanosecondsDelta = 0
    expected[2][1].start_date.nanosecondsDelta = 0

    const helper = env.tvpHelper(tableName)
    await helper.create(tableName)
    const params = ['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)]
    const res = await env.theConnection.promises.callProc('callProcedureFromProcedure', params, {
      replaceEmptyColumnNames: true
    })
    expect(res.results).to.deep.equal(expected)
  })

  it('use tvp to select from table type complex object Employee type', async function handler () {
    const tableName = 'employee'

    await env.promisedDropCreateTable({
      tableName
    })
    const promises = env.theConnection.promises
    const bulkMgr = await promises.getTable(tableName)
    let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
    sql += ' drop type EmployeeType'
    await promises.query(sql)
    sql = bulkMgr.asUserType()
    await promises.query(sql)
    const parsedJSON = env.helper.getJSON()
    // construct a table type based on a table definition.
    const table = bulkMgr.asTableType()
    // convert a set of objects to rows
    table.addRowsFromObjects(parsedJSON)
    // use a type the native driver can understand, using column based bulk binding.
    const tp = env.sql.TvpFromTable(table)
    const res = await promises.query('select * from ?;', [tp])
    env.helper.compareEmployee(res.first, parsedJSON)
  })

  it('employee use tm to get a table value type representing table and create that user table type', async function handler () {
    const tableName = 'employee'
    await env.promisedDropCreateTable({
      tableName
    })
    const promises = env.theConnection.promises
    const bulkMgr = await promises.getTable(tableName)
    let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
    sql += ' drop type EmployeeType'
    await promises.query(sql)
    sql = bulkMgr.asUserType()
    await promises.query(sql)
    const def = await promises.getUserTypeTable('EmployeeType')
    const summary = bulkMgr.getSummary()
    expect(def.columns.length).to.equal(summary.columns.length)
    const t = bulkMgr.asTableType()
    expect(t.columns.length).to.equal(summary.columns.length)
  })

  it('use tvp simple test type insert test using pm', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    const promises = env.theConnection.promises
    await promises.callProc('insertTestTvp', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(vec)
  })



  it('dbo schema use tvp simple test type select test', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    const res = await env.theConnection.promises.query('select * from ?;', [tp])
    expect(res.first).to.deep.equal(vec)
  })

  it('use tvp simple test type insert test', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    const promises = env.theConnection.promises
    await promises.query('exec insertTestTvp @tvp = ?;', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(vec)
  })
})
