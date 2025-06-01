const commonTestFns = require('./CommonTestFunctions')

const supp = require('../../samples/typescript/demo-support')
const sql = require('../../../msnodesqlv8')
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
const { EncryptHelper } = require('./encrypt-helper')
const util = require('util')
const fs = require('fs')
const path = require('path')
const chai = require('chai')

class CommonTestFnPromises {
  constructor () {
    this.create = util.promisify(commonTestFns.createTable)
    this.insert = util.promisify(commonTestFns.insertDataTSQL)
    this.verifyData_Datetime = util.promisify(commonTestFns.verifyData_Datetime)
    this.verifyData = util.promisify(commonTestFns.verifyData)
    this.invalidQueryTSQL = util.promisify(commonTestFns.invalidQueryTSQL)
  }
}

// await testPromises.create(env.theConnection, tablename, testcolumnname, testcolumntype)
//

class CommonTestFnParams {
  constructor (tableName, testColumnName) {
    this.tableName = tableName
    this.testColumnName = testColumnName
    this.testcolumntype = null
    this.testdata1 = null
    this.testdata2TsqlInsert = null
    this.rowWithNullData = null
    this.jsDateExpected = null
    this.testname = 'proxy'
  }
}

class CommonTestFnProxy {
  constructor (connectionProxy, tableName, testColumnName) {
    this.connectionProxy = connectionProxy
    this.promises = new CommonTestFnPromises()
    this.params = new CommonTestFnParams(tableName, testColumnName)
  }

  async create (testcolumntype) {
    this.params.testcolumntype = testcolumntype
    return this.promises.create(this.connectionProxy, this.params.tableName, this.params.testColumnName, testcolumntype)
  }

  async insert (val) {
    return this.promises.insert(this.connectionProxy, this.params.tableName, this.params.testColumnName, val)
  }

  async verifyData_Datetime (rowWithNullData, jsDateExpected, testname) {
    return this.promises.verifyData_Datetime(this.connectionProxy, this.params.tableName, this.params.testColumnName, rowWithNullData, jsDateExpected, testname)
  }

  async verifyData (expected, testname) {
    return this.promises.verifyData(this.connectionProxy, this.params.tableName, this.params.testColumnName, expected, testname)
  }

  async invalidQuery (tsql, ExpectedError, testname) {
    return this.promises.invalidQueryTSQL(this.connectionProxy, this.params.tableName, tsql, ExpectedError, testname)
  }

  // const invalidQueryTSQL = (Connection, tsql, ExpectedError, testname, done)
  //  env.commonTestFns.verifyData(env.theConnection, tablename, testcolumnname, expected, testname, done)

  async testerDatetime () {
    const p = this.params
    await this.create(p.testcolumntype)
    await this.insert(p.testdata1)
    await this.insert(p.testdata2TsqlInsert)
    await this.verifyData_Datetime(p.rowWithNullData, p.jsDateExpected, p.testname)
  }
}

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

    if (!ret) {
      key = 'CONNECTION_KEY'
      if (subSection[key]) {
        key = subSection[key]
        ret = subSection[key]
      }
    }
    // subSection[key] || config[key]?.DEFAULT
    return ret
  }

  getConnection (key, fallback) {
    fallback = fallback || 'LINUX'
    const rcRes = process.env[fallback] ?? process.env.DEFAULT
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
    return new BuilderChecker(builder, this)
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

  async connection () {
    return await this.sql.promises.open(this.connectionString)
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

  decodeSqlServerVersion () {
    const myRegexp = /Driver=\{ODBC Driver (.*?) for SQL Server}.*$/g
    const match = myRegexp.exec(this.connectionString)
    return match !== null ? parseInt(match[1]) : 0
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
    const pool = this.pool(2)
    await pool.open()
    await fn(pool)
    await pool.close()
  }

  /*
      {
+     col_a: 0.2857142857142857,
-     col_a: 0.28571428571428564,
      id: 1
    },
   */
  fractionalEqual (d1, d2, precision) {
    precision = precision || 1e-14
    const tolerance = Math.pow(10, precision)
    return Math.abs(d1 - d2) <= tolerance
  }

  dropIndexSql (tableName, indexName) {
    indexName = indexName || `ix_${tableName}`
    return `IF EXISTS(
    SELECT * 
    FROM sys.indexes 
    WHERE name='${indexName}' AND OBJECT_ID = OBJECT_ID('${tableName}')
)
BEGIN
    DROP INDEX ${indexName} ON [${tableName}]
END`
  }

  dropTableSql (tableName) {
    return `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`
  }

  async readFile (f) {
    return new Promise((resolve, reject) => {
      fs.readFile(f, 'utf8', (err, contents) => {
        if (err) {
          reject(err)
        } else {
          resolve(contents)
        }
      })
    })
  }

  async readAsBinary (file) {
    return new Promise((resolve, reject) => {
      const p = path.join(__dirname, 'data', file)
      this.readFile(p).then(d => {
        resolve(Buffer.from(d))
      }).catch(e => {
        reject(e)
      })
    })
  }

  makeTestFnProxy (tableName, testColumnName, connectionProxy) {
    connectionProxy = connectionProxy || this.theConnection
    return new CommonTestFnProxy(connectionProxy, tableName, testColumnName)
  }

  async getDbName () {
    const res = await this.theConnection.promises.query('SELECT db_NAME() as [db]')
    return res.first[0].db || 'node'
  }

  waitForSql (secs) {
    const waitsql = `waitfor delay '00:00:${secs}';`
    return waitsql
  }

  isEncryptedConnection () {
    return (this.connectionString.includes('ColumnEncryption=Enabled'))
  }

  constructor (key) {
    this.theConnection = null
    this.employee = null
    this.connectionString = this.getConnection(key)
    this.driver = this.decodeDriver()
    this.driverVersion = this.decodeSqlServerVersion()
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
    this.encryptHelper = new EncryptHelper()
    this.commonTestFns = commonTestFns
    this.commonTestFnPromises = new CommonTestFnPromises()
    this.sql = sql
  }
}

exports.TestEnv = TestEnv
