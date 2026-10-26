'use strict'

const assert = require('chai').assert
const { maskPassword } = require('../lib/connection')

/* globals describe it */

// a trace log is something users are asked to send: it must never hold the password
describe('the connection string as logged', function () {
  const cases = [
    ['Driver={ODBC Driver 18 for SQL Server};Server=s;UID=sa;PWD=secret;Database=d',
      'Driver={ODBC Driver 18 for SQL Server};Server=s;UID=sa;PWD=********;Database=d'],
    ['Server=s;uid=sa;pwd=secret', 'Server=s;uid=sa;pwd=********'],
    ['Server=s;User Id=sa;Password=secret;', 'Server=s;User Id=sa;Password=********;'],
    ['PWD=secret;Server=s', 'PWD=********;Server=s'],
    ['Server=s; Pwd = secret ;Database=d', 'Server=s; Pwd = ********;Database=d'],
    ['Server=s;PWD={se;cr}}et};Database=d', 'Server=s;PWD=********;Database=d'],
    ['Server=s;Trusted_Connection=yes', 'Server=s;Trusted_Connection=yes'],
    ['Server=s;PWD={unclosed;Database=d', 'Server=s;PWD=********'],
    ['Driver={a;b};PWD=secret', 'Driver={a;b};PWD=********']
  ]

  cases.forEach(([given, logged]) => {
    it(`masks ${given}`, function () {
      assert.strictEqual(maskPassword(given), logged)
    })
  })

  // one pass over the string: no input makes it slow
  it('is linear on many unclosed braced passwords', function () {
    const given = 'pwd={' + ';pwd={'.repeat(200000)
    const start = Date.now()
    const logged = maskPassword(given)
    assert.isBelow(Date.now() - start, 500)
    assert.strictEqual(logged, 'pwd=********')
  })
})
