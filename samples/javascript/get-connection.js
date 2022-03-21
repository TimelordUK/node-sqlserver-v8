
class GetConnection {
  getConnection (key) {
    key = key || 'local'
    const path = require('path')
    const config = require(path.join(__dirname, 'config.json'))
    return config.connection[key]
  }

  constructor () {
    this.connectionString = this.getConnection()
  }
}

exports.GetConnection = GetConnection
