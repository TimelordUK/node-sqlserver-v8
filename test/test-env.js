
const supp = require('../samples/typescript/demo-support')
const sql = require('msnodesqlv8')

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
  }

  async close () {
    if (this.theConnection) {
      await this.theConnection.promises.close()
      this.theConnection = null
    }
  }

  constructor () {
    this.theConnection = null
    this.connectionString = this.getConnection()
    const ds = new supp.DemoSupport(sql)
    this.support = ds
    this.helper = new ds.EmployeeHelper(sql, this.connectionString)
    this.procedureHelper = new ds.ProcedureHelper(this.connectionString)
    this.async = new ds.Async()
  }
}

exports.TestEnv = TestEnv
