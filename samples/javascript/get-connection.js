
class GetConnection {
  getConnection () {
    const path = require('path')
    const config = require(path.join(__dirname, 'config.json'))
    return config.connection.local
  }

  constructor () {
    this.connectionString = this.getConnection()
  }
}

exports.GetConnection = GetConnection
