
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
const assert = require('assert')

class TestEnv {
  readJson (path) {
    const fs = require('fs')
    return JSON.parse(fs.readFileSync(path, 'utf8'))
  }

  fromJson (key) {
    const path = require('path')
    const rcPath = path.join(__dirname, '../../.env-cmdrc')
    const config = this.readJson(rcPath)
    const subSection = config[key] || config.test
    let ret = null
    if (subSection) {
      ret = subSection[key]
    }
    if (!ret) {
      if (config[key]) {
        ret = config[key].DEFAULT
      }
    }
    // subSection[key] || config[key]?.DEFAULT
    return ret
  }

  getConnection (key, fallback) {
    fallback = fallback || 'LINUX'
    const rcRes = process.env[fallback] || process.env.DEFAULT
    if (rcRes) {
      return rcRes
    } else if (process.env.CONNECTION_KEY) {
      return process.env[process.env.CONNECTION_KEY]
    } else {
      return this.fromJson(key || fallback)
    }
  }

  userConnection (givenConnection) {
    return givenConnection || this.theConnection
  }

  bulkTableTest (def, connection) {
    return new BulkTableTest(this.userConnection(connection), def)
  }

  tableHelper (connection) {
    return new TableHelper(this.userConnection(connection))
  }

  typeTableHelper (sqlType, connection) {
    return new TypeTableHelper(this.userConnection(connection), sqlType)
  }

  procTest (def) {
    return new ProcTest(this.theConnection, def)
  }

  bcpEntry (def, factory, tester) {
    return new BcpEntry(this, def, factory, tester)
  }

  builderChecker (builder) {
    return new BuilderChecker(builder)
  }

  tvpHelper (tableName, connectionProxy) {
    connectionProxy = connectionProxy || this.theConnection
    return new TvpHelper(connectionProxy, tableName)
  }

  jsonHelper (tableName, procName, procNameJson) {
    tableName = tableName || 'employeeJson'
    procName = procName || 'AddUpdateEmployeeJsonRecord'
    procNameJson = procNameJson || 'ParseJsonArray'
    return new JsonHelper(this.theConnection, tableName, procName, procNameJson)
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

  pool (size) {
    size = size || 4
    return new this.sql.Pool({
      connectionString: this.connectionString,
      ceiling: size
    })
  }

  decodeDriver () {
    const myRegexp = /Driver=\{(.*?)}.*$/g
    const match = myRegexp.exec(this.connectionString)
    return match[1]
  }

  repeat (c, num) {
    return new Array(num + 1).join(c)
  }

  async getTableCount (tableName, connection) {
    const proxy = connection || this.theConnection
    const countSql = `select count(*) as count from ${tableName}`
    const results = await proxy.promises.query(countSql)
    return results.first[0].count
  }

  async asPool (fn) {
    const pool = this.pool(4)
    await pool.open()
    await fn(pool)
    await pool.close()
  }

  async doesThrow (sql, message, connection) {
    const proxy = connection || this.theConnection
    try {
      await proxy.promises.query(sql)
      return false
    } catch (e) {
      return (e.message.includes(message))
    }
  }

  constructor (key) {
    this.theConnection = null
    this.employee = null
    this.connectionString = this.getConnection(key)
    this.driver = this.decodeDriver()
    const ds = new supp.DemoSupport(sql)
    this.support = ds
    this.helper = new ds.EmployeeHelper(sql, this.connectionString)
    this.helper.setVerbose(false)
    this.procedureHelper = new ds.ProcedureHelper(this.connectionString)
    this.promisedCreate = util.promisify(this.procedureHelper.createProcedure)
    this.promisedDropCreateTable = util.promisify(this.helper.dropCreateTable)
    this.procedureHelper.setVerbose(false)
    this.async = new ds.Async()
    this.timeHelper = new TimeHelper()
    this.commonTestFns = commonTestFns
    this.sql = sql
  }
}

exports.TestEnv = TestEnv
