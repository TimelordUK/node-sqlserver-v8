'use strict'

// CommonJS-style test file that works with chai-as-promised v7
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const { TestEnv } = require('./env/test-env')

// Setup chai
chai.use(chaiAsPromised)
const { expect } = chai

describe('Example CommonJS Test', function () {
  this.timeout(30000)
  let env

  before(async function () {
    env = new TestEnv()
    await env.open()
  })

  after(async function () {
    if (env) {
      await env.close()
    }
  })

  it('should handle promises correctly', async function () {
    // Test promise resolution
    const result = await env.theConnection.promises.query('SELECT 1 as num')
    expect(result.first[0].num).to.equal(1)
  })

  it('should handle promise rejection', async function () {
    // Test promise rejection with chai-as-promised
    const badQuery = env.theConnection.promises.query('SELECT * FROM NonExistentTable')
    await expect(badQuery).to.be.rejected
  })

  it('should test with eventually', function () {
    // Using eventually for async assertions
    const promise = env.theConnection.promises.query('SELECT 42 as answer')
    return expect(promise).to.eventually.have.property('first')
      .that.has.length(1)
  })
})