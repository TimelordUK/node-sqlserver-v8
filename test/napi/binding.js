// test/napi/open.js
'use strict'

const chai = require('chai')
const assert = chai.assert

const sql = require('msnodesqlv8')
const { SqlParameter } = sql
sql.setLogLevel(4) // Debug level
sql.enableConsoleLogging(true)

describe('binding sql parameters', function () {
  this.timeout(0)
  this.beforeEach(async () => {
  })

  this.afterEach(async function () {
  })

  it('bind a simple scalar string', async () => {
    const stringParam = SqlParameter.fromValue('Hello World', {})
  })
})
