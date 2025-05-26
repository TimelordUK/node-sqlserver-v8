'use strict'
class ServerDialect {
  constructor (name) {
    this.name = name
  }

  static Sybase = new ServerDialect('Sybase')
  static SqlServer = new ServerDialect('SqlServer')
}

module.exports = {
  ServerDialect
}
