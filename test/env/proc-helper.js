class ProcTest {
  dropProcedureSql

  constructor (theConnection, def) {
    this.def = def
    this.theConnection = theConnection
    this.dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${def.name}'))
      begin drop PROCEDURE ${def.name} end `
  }

  async create () {
    try {
      const promises = this.theConnection.promises
      await promises.query(this.dropProcedureSql)
      await promises.query(this.def.sql || this.def.def)
    } catch (e) {
      console.log(e)
    }
  }

  async drop () {
    try {
      const promises = this.theConnection.promises
      await promises.query(this.dropProcedureSql)
    } catch (e) {
      console.log(e)
    }
  }

  query (sql, params, options) {
    return this.theConnection.promises.query(sql, params, options)
  }

  call (o, options) {
    return this.theConnection.promises.callProc(this.procName, o, options)
  }
}

module.exports = {
  ProcTest
}
