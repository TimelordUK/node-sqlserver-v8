'use strict'
class ServerDialect {
  constructor (name) {
    this.name = name
  }

  static Oracle = new ServerDialect('Oracle')
  static Sybase = new ServerDialect('Sybase')
  static SqlServer = new ServerDialect('SqlServer')
}

module.exports = {
  ServerDialect
}
