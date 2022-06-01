const assert = require('assert')

class BuilderChecker {
  constructor (builder) {
    this.builder = builder
  }

  async check (makeOne, compare) {
    const builder = this.builder
    const table = builder.toTable()
    await builder.drop()
    await builder.create()
    const vec = []
    for (let i = 0; i < 20; ++i) {
      vec.push(makeOne(i))
    }
    await table.promises.insert(vec)
    const primaryCols = builder.primaryColumns
    const keys = vec.map(elem => {
      return primaryCols.reduce(function (obj, column) {
        if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
          obj[column.name] = elem[column.name]
        }
        return obj
      }, {})
    })

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

    await builder.drop()
  }
}

module.exports = {
  BuilderChecker
}
