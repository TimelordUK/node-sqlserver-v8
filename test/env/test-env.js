
const commonTestFns = require('./CommonTestFunctions')

const supp = require('../../samples/typescript/demo-support')
const sql = require('msnodesqlv8')
const { TimeHelper } = require('./time-helper')
const { Employee } = require('./employee')
const { GeographyHelper } = require('./geography-helper')
const { JsonHelper } = require('./json-helper')
const { TableHelper } = require('./table-helper')
const { TypeTableHelper } = require('./type-table-helper')
const { BulkTableTest } = require('./bulk-table-test')
const { ProcTest } = require('./proc-helper')
const { BcpEntry } = require('./bcp-entry')
const { BuilderChecker } = require('./builder-checker')
const { TvpHelper } = require('./tvp-helper')
const util = require('util')

class TestEnv {
  readJson (path) {
    const fs = require('fs')
    return JSON.parse(fs.readFileSync(path, 'utf8'))
  }

  getConnection (key) {
    const fallback = 'LINUX'
    const rckey = process.env.CONNECTION_KEY || process.env[fallback]
    if (rckey) {
      return process.env[rckey]
    } else {
      key = key || fallback
      const path = require('path')
      const config = this.readJson(path.join(__dirname, '../../.env-cmdrc'))
      const subSection = config.test
      return subSection[key]
    }
  }

  bulkTableTest (def) {
    return new BulkTableTest(this.theConnection, def)
  }

  tableHelper () {
    return new TableHelper(this.theConnection)
  }

  typeTableHelper (sqlType) {
    return new TypeTableHelper(this.theConnection, sqlType)
  }

  procTest (name, def) {
    return new ProcTest(this.theConnection, name, def)
  }

  bcpEntry (def, factory, tester) {
    return new BcpEntry(this, def, factory, tester)
  }

  builderChecker (builder) {
    return new BuilderChecker(builder)
  }

  tvpHelper (tableName) {
    return new TvpHelper(this.theConnection, tableName)
  }

  jsonHelper (tableName, procName, procNameJson) {
    tableName = tableName || 'employeeJson'
    procName = procName || 'AddUpdateEmployeeJsonRecord'
    procNameJson = procNameJson || 'ParseJsonArray'
    const jsonHelper = new JsonHelper(this.theConnection, tableName, procName, procNameJson)
    return jsonHelper
  }

  async open () {
    this.theConnection = await sql.promises.open(this.connectionString)
    this.employee = new Employee('employee', this.helper, this.theConnection)
    this.geographyHelper = new GeographyHelper(this.theConnection)
  }

  async close () {
    if (this.theConnection) {
      await this.theConnection.promises.close()
      this.theConnection = null
      this.employee = null
      this.geographyHelper = null
    }
  }

  decodeDriver () {
    const myRegexp = /Driver=\{(.*?)\}.*$/g
    const match = myRegexp.exec(this.connectionString)
    const driver = match[1]
    return driver
  }

  repeat (c, num) {
    return new Array(num + 1).join(c)
  }

  constructor () {
    this.theConnection = null
    this.employee = null
    this.connectionString = this.getConnection()
    this.driver = this.decodeDriver()
    const ds = new supp.DemoSupport(sql)
    this.support = ds
    this.helper = new ds.EmployeeHelper(sql, this.connectionString)
    this.helper.setVerbose(false)
    this.procedureHelper = new ds.ProcedureHelper(this.connectionString)
    this.promisedCreate = util.promisify(this.procedureHelper.createProcedure)
    this.procedureHelper.setVerbose(false)
    this.async = new ds.Async()
    this.timeHelper = new TimeHelper()
    this.commonTestFns = commonTestFns
    this.sql = sql
  }
}

exports.TestEnv = TestEnv
