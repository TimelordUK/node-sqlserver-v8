const assert = require('assert')

class BuilderChecker {
  constructor (builder, env) {
    this.builder = builder
    this.env = env
  }

  async select (table, compare, vec, keys) {
    const s1 = await table.promises.select(keys)
    assert.deepStrictEqual(vec.length, s1.length)
    for (let i = 0; i < vec.length; ++i) {
      const lhs = vec[i]
      const rhs = s1[i]
      if (compare) {
        compare(lhs, rhs)
      } else {
        assert.deepStrictEqual(lhs, rhs)
      }
    }
  }

  getKeys (table, vec) {
    const builder = this.builder
    const primaryCols = builder.primaryColumns
    return vec.map(elem => {
      return primaryCols.reduce(function (obj, column) {
        if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
          obj[column.name] = elem[column.name]
        }
        return obj
      }, {})
    })
  }

  make (makeOne, n) {
    n = n || 20
    const vec = []
    for (let i = 0; i < n; ++i) {
      vec.push(makeOne(i))
    }
    return vec
  }

  async checkTvp (makeOne, compare, rows) {
    rows = rows || 5
    const theConnection = this.env.theConnection
    const vec = this.make(makeOne, rows)
    const builder = this.builder
    const table = builder.toTable()
    await builder.drop()
    await builder.create()
    const procName = builder.insertTvpProcedureName
    const dropType = builder.dropTypeSql
    const userTypeSql = builder.userTypeTableSql
    const tvpProcSql = builder.insertProcedureTvpSql
    const env = this.env
    const prochelper = env.procTest({
      name: procName,
      sql: tvpProcSql
    })

    const promises = theConnection.promises
    await prochelper.drop()
    await promises.query(dropType)
    await promises.query(userTypeSql)
    await promises.query(tvpProcSql)
    const tvpTable = await promises.getUserTypeTable(builder.typeName)
    tvpTable.addRowsFromObjects(vec)
    const tp = this.env.sql.TvpFromTable(tvpTable)
    await promises.callProc(procName, [tp])
    tvpTable.rows = []
    const keys = this.getKeys(table, vec)
    await this.select(table, compare, vec, keys)
  }

  async check (makeOne, compare) {
    const builder = this.builder
    const table = builder.toTable()
    await builder.drop()
    await builder.create()
    const vec = this.make(makeOne)

    await table.promises.insert(vec)
    const keys = this.getKeys(table, vec)
    await this.select(table, compare, vec, keys)
    await builder.drop()
  }
}

module.exports = {
  BuilderChecker
}
