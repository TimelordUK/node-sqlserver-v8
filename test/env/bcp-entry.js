const assert = require('assert')

class BcpEntry {
  constructor (env, definition, factory, tester) {
    this.definition = definition
    this.factory = factory
    this.tester = tester
    this.env = env
  }

  async runner (count) {
    const helper = this.env.bulkTableTest(this.definition)
    const expected = []
    const rows = count || 5000
    for (let i = 0; i < rows; ++i) {
      expected.push(this.factory(i))
    }
    const theConnection = this.env.theConnection
    theConnection.setUseUTC(true)
    const table = await helper.create()
    table.setUseBcp(true)
    await table.promises.insert(expected)
    const res = await theConnection.promises.query(`select count(*) as rows from ${this.definition.tableName}`)
    assert.deepStrictEqual(res.first[0].rows, rows)
    const top = await theConnection.promises.query(`select top 100 * from ${this.definition.tableName}`)
    const toCheck = expected.slice(0, 100)
    if (this.tester) {
      this.tester(top.first, toCheck)
    } else {
      assert.deepStrictEqual(top.first, toCheck)
    }
  }
}

module.exports = {
  BcpEntry
}
