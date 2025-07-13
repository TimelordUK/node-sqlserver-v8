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
const { configureTestLogging } = require('./common/logging-helper')

configureTestLogging(sql)

describe('tvp', function () {
  this.timeout(30000)

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

  async function checkTxt (tableName, vec) {
    tableName = tableName || 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const promises = env.theConnection.promises
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    await promises.query('exec insertTestTvp @tvp = ?;', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(vec)
  }

  it('use tvp simple test type insert test long string 8 * 1024', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(8 * 1024)
    await checkTxt(tableName, vec)
  })

  it('use tvp simple test type insert test extended ascii', async function handler () {
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName)
    const vec = helper.getExtendedVec(8 * 1024)
    await checkTxt(tableName, vec)
  })

  async function namedtvp (tableName) {
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    table.rows = []
    const res = await env.theConnection.promises.query('select * from ?;', [tp])
    expect(res.first).to.deep.equal(vec)
  }

  it('dbo schema use tvp simple test type select test', async function handler () {
    const tableName = 'TestTvp'
    await namedtvp(tableName)
  })

  it('non dbo schema use tvp simple test type select test', async function handler () {
    const tableName = 'TestSchema.TestTvp'
    await namedtvp(tableName)
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

  async function setupEmployee (tableName) {
    tableName = tableName || 'employee'
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
    return bulkMgr
  }

  it('use tvp to select from table type complex object Employee type', async function handler () {
    const bulkMgr = await setupEmployee()
    const parsedJSON = env.helper.getJSON()
    // construct a table type based on a table definition.
    const table = bulkMgr.asTableType()
    // convert a set of objects to rows
    table.addRowsFromObjects(parsedJSON)
    const promises = env.theConnection.promises
    // use a type the native driver can understand, using column based bulk binding.
    const tp = env.sql.TvpFromTable(table)
    const res = await promises.query('select * from ?;', [tp])
    env.helper.compareEmployee(res.first, parsedJSON)
  })

  it('employee use tm to get a table value type representing table and create that user table type', async function handler () {
    const bulkMgr = await setupEmployee()
    const promises = env.theConnection.promises
    const def = await promises.getUserTypeTable('EmployeeType')
    const summary = bulkMgr.getSummary()
    expect(def.columns.length).to.equal(summary.columns.length)
    const t = bulkMgr.asTableType()
    expect(t.columns.length).to.equal(summary.columns.length)
  })

  class TvpRows {
    constructor (tableName) {
      this.tableName = tableName || 'TestTvp'
    }

    makeRows (num) {
      num = num || 100
      const helper = env.tvpHelper(this.tableName)
      return helper.getVec(num)
    }

    async tvpGetTable () {
      const tableName = this.tableName
      const helper = env.tvpHelper(tableName)
      this.vec = this.makeRows()
      const table = await helper.create(tableName)
      table.addRowsFromObjects(this.vec)
      const tp = env.sql.TvpFromTable(table)
      table.rows = []
      return tp
    }
  }

  it('use tvp simple test type insert test using pm', async function handler () {
    const tableName = 'TestTvp'
    const tvpr = new TvpRows(tableName)
    const tp = await tvpr.tvpGetTable()
    const promises = env.theConnection.promises
    await promises.callProc('insertTestTvp', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(tvpr.vec)
  })

  it('use tvp simple test type insert test', async function handler () {
    const tableName = 'TestTvp'
    const tvpr = new TvpRows(tableName)
    const tp = await tvpr.tvpGetTable()
    const promises = env.theConnection.promises
    await promises.query('exec insertTestTvp @tvp = ?;', [tp])
    const res = await promises.query(`select * from ${tableName}`)
    expect(res.first).to.deep.equal(tvpr.vec)
  })

  it('test inspectionFindingsData TVP issue - single vs multiple rows', async function handler () {
    const promises = env.theConnection.promises
    const tableName = 'inspectionFindingsData'

    // Clean up any previous test artifacts first (this is the missing piece!)
    await promises.query(`IF OBJECT_ID('testInspectionFindings', 'P') IS NOT NULL DROP PROCEDURE testInspectionFindings`).catch(() => {})
    await promises.query(`IF TYPE_ID(N'dbo.inspectionFindingsDataType') IS NOT NULL DROP TYPE dbo.inspectionFindingsDataType`).catch(() => {})

    // Test data - single row that was failing
    const singleRowData = [{
      uuid: 'A2FF83F2-963F-4553-8837-D785E20707E3',
      inspectionUuid: 'ECA07CC2-DF99-4868-999A-F14A2CC1A949',
      identifierChecklistUuid: 'D274B030-A019-4C00-8396-01E53388E5FE',
      inquiryId: '58BF1BE5-3FB7-4562-A239-27AFE621317C',
      inspectionFindingId: '420B660C-B959-4B2B-90D9-55ACB657D94D',
      parentFindingId: null,
      deadline: '',
      requirementsValue: '["58BF1BE5-3FB7-4562-A239-27AFE621317C"]',
      classificationValue: '["2CA61A42-6F25-48E3-84EF-424692E3E1CC"]',
      title: 'Specific Rights',
      text: '<p>Violation</p><p></p><p></p>',
      correctionRequired: '1',
      findingAddedBy: 'Matt Hoffman',
      findingAddedOn: '04/17/2025',
      displayOrder: 0
    }]

    // Use table builder to create the TVP
    const mgr = env.theConnection.tableMgr()
    const builder = mgr.makeBuilder(tableName)

    // Define the table structure using builder
    builder.addColumn('uuid').asUniqueIdentifier().notNull()
    builder.addColumn('inspectionUuid').asUniqueIdentifier().notNull()
    builder.addColumn('identifierChecklistUuid').asUniqueIdentifier().notNull()
    builder.addColumn('inquiryId').asUniqueIdentifier().notNull()
    builder.addColumn('inspectionFindingId').asUniqueIdentifier().null()
    builder.addColumn('parentFindingId').asUniqueIdentifier().null()
    builder.addColumn('deadline').asVarChar(50).null()
    builder.addColumn('requirementsValue').asVarCharMax().null()
    builder.addColumn('classificationValue').asVarCharMax().null()
    builder.addColumn('title').asVarCharMax().null()
    builder.addColumn('text').asVarCharMax().null()
    builder.addColumn('correctionRequired').asVarChar(5).null()
    builder.addColumn('findingAddedBy').asVarChar(100).null()
    builder.addColumn('findingAddedOn').asVarChar(50).null()
    builder.addColumn('displayOrder').asInt().null()

    // Setup table and TVP using builder pattern (like BuilderChecker.checkTvp)
    const table = builder.toTable()
    await builder.drop()
    await builder.create()

    // Create the TVP type and procedure using builder-generated SQL
    const procName = builder.insertTvpProcedureName
    const dropType = builder.dropTypeSql
    const userTypeSql = builder.userTypeTableSql
    const tvpProcSql = builder.insertProcedureTvpSql

    const prochelper = env.procTest({
      name: procName,
      sql: tvpProcSql
    })

    await prochelper.drop()
    await promises.query(dropType)
    await promises.query(userTypeSql)
    await promises.query(tvpProcSql)

    // Test with single row - this was failing in the original issue
    const tvpTableSingle = await promises.getUserTypeTable(builder.typeName)
    tvpTableSingle.addRowsFromObjects(singleRowData)
    const tvpSingle = env.sql.TvpFromTable(tvpTableSingle)

    try {
      await promises.callProc(procName, [tvpSingle])
      console.log('Single row TVP test passed')

      // Verify the data was inserted correctly
      const singleResult = await promises.query(`SELECT * FROM ${tableName}`)
      expect(singleResult.first.length).to.equal(1)
      expect(singleResult.first[0].uuid.toLowerCase()).to.equal(singleRowData[0].uuid.toLowerCase())
    } catch (error) {
      console.error('Single row TVP test failed:', error.message)
      throw error
    }

    // Clear table for next test
    await promises.query(`DELETE FROM ${tableName}`)

    // Test with multiple rows - this was working in the original issue
    const multiRowData = [...singleRowData, {
      uuid: 'B3FF83F2-963F-4553-8837-D785E20707E4',
      inspectionUuid: 'ECA07CC2-DF99-4868-999A-F14A2CC1A949',
      identifierChecklistUuid: 'D274B030-A019-4C00-8396-01E53388E5FE',
      inquiryId: '58BF1BE5-3FB7-4562-A239-27AFE621317C',
      inspectionFindingId: '420B660C-B959-4B2B-90D9-55ACB657D94D',
      parentFindingId: null,
      deadline: '',
      requirementsValue: '["58BF1BE5-3FB7-4562-A239-27AFE621317C"]',
      classificationValue: '["2CA61A42-6F25-48E3-84EF-424692E3E1CC"]',
      title: 'Another Finding',
      text: '<p>Another Violation</p>',
      correctionRequired: '1',
      findingAddedBy: 'Jane Doe',
      findingAddedOn: '04/18/2025',
      displayOrder: 1
    }]

    const tvpTableMulti = await promises.getUserTypeTable(builder.typeName)
    tvpTableMulti.addRowsFromObjects(multiRowData)
    const tvpMulti = env.sql.TvpFromTable(tvpTableMulti)

    try {
      await promises.callProc(procName, [tvpMulti])
      console.log('Multiple row TVP test passed')

      // Verify the data was inserted correctly
      const multiResult = await promises.query(`SELECT * FROM ${tableName} ORDER BY displayOrder`)
      expect(multiResult.first.length).to.equal(2)
      expect(multiResult.first[0].uuid.toLowerCase()).to.equal(multiRowData[0].uuid.toLowerCase())
      expect(multiResult.first[1].uuid.toLowerCase()).to.equal(multiRowData[1].uuid.toLowerCase())
    } catch (error) {
      console.error('Multiple row TVP test failed:', error.message)
      throw error
    }

    // Clean up
    await prochelper.drop()
    await promises.query(dropType)
    await builder.drop()
  })
})
