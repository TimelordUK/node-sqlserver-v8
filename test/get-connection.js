
class GetConnection {
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

  constructor () {
    this.connectionString = this.getConnection()
  }
}

exports.GetConnection = GetConnection
