
const supp = require('../samples/typescript/demo-support')
const sql = require('msnodesqlv8')
const TimeHelper = require('./time-helper').TimeHelper
const Employee = require('./employee').Employee

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
      const config = this.readJson(path.join(__dirname, '../.env-cmdrc'))
      const subSection = config.test
      return subSection[key]
    }
  }

  async open () {
    this.theConnection = await sql.promises.open(this.connectionString)
    this.employee = new Employee('employee', this.helper, this.theConnection)
  }

  async close () {
    if (this.theConnection) {
      await this.theConnection.promises.close()
      this.theConnection = null
      this.employee = null
    }
  }

  constructor () {
    this.theConnection = null
    this.employee = null
    this.connectionString = this.getConnection()
    const ds = new supp.DemoSupport(sql)
    this.support = ds
    this.helper = new ds.EmployeeHelper(sql, this.connectionString)
    this.helper.setVerbose(false)
    this.procedureHelper = new ds.ProcedureHelper(this.connectionString)
    this.procedureHelper.setVerbose(false)
    this.async = new ds.Async()
    this.timeHelper = new TimeHelper()
  }
}

exports.TestEnv = TestEnv
