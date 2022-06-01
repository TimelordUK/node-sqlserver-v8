class ProcTest {
  async create () {
    const promises = this.theConnection.promises
    await promises.query(this.dropProcedureSql)
    await promises.query(this.def)
  }

  constructor (theConnection, spName, def) {
    this.dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${spName}'))
begin drop PROCEDURE ${spName} end `
    this.theConnection = theConnection
    this.def = def
  }
}

module.exports = {
  ProcTest
}
