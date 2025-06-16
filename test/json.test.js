'use strict'

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
const sql = require('../lib/sql')

/* globals describe it beforeEach afterEach */

const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

describe('json', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    sql.logger.info('Starting test setup', 'json.test.beforeEach')
    env.open().then(() => {
      sql.logger.info('Test environment opened successfully', 'json.test.beforeEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to open test environment: ${e}`, 'json.test.beforeEach')
      sql.logger.error(e)
    })
  })

  this.afterEach(done => {
    sql.logger.info('Starting test cleanup', 'json.test.afterEach')
    env.close().then(() => {
      sql.logger.info('Test environment closed successfully', 'json.test.afterEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to close test environment: ${e}`, 'json.test.afterEach')
      sql.logger.error(e)
    })
  })

  function insertRec (p, id, element) {
    const txt = JSON.stringify(element, null, 4)
    return p.promises.call({
      ID: id++,
      json: txt
    }).then(() => {
      return txt
    })
  }

  it('use proc to insert a JSON array and bulk parse on server', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promises = env.theConnection.promises
    const json = JSON.stringify(parsedJSON, null, 4)
    const res = await promises.callProc(procNameJson, { json })
    expect(Array.isArray(res.first))
    const expected = parsedJSON.map(r => {
      const { OrganizationNode, ...rest } = r
      return rest
    })
    expect(res.first).to.deep.equals(expected)
  })

  it('use proc to insert a JSON based complex object', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promises = env.theConnection.promises
    const p = await promises.getProc(procName)
    let id = 0
    const inserts = parsedJSON.map(r => insertRec(p, id++, r))
    const expected = await Promise.all(inserts)
    const selectedRecords = await promises.query(`select * from ${tableName} order by id asc`)
    const selected = selectedRecords.first.map(rec => rec.json)
    expect(selected).to.deep.equals(expected)
  })
})
