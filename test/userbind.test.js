'use strict'

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

describe('userbind', function () {
  this.timeout(30000)

  beforeEach(async function () {
    await env.open()
  })

  afterEach(async function () {
    await env.close()
  })

  async function testUserBindAsync (params) {
    const promises = env.theConnection.promises
    const r1 = await promises.query(params.query, [params.setter(params.min)])
    const r2 = await promises.query(params.query, [params.setter(params.max)])
    const allres = [r1.first[0], r2.first[0]]
    if (params.test_null) {
      const r3 = promises.query(params.query, [params.setter(null)])
      allres.push(r3)
    }
    return allres
  }

  function compare (params, res) {
    const min = params.expected ? params.expected[0] : params.min
    const max = params.expected ? params.expected[1] : params.max
    const expected = [
      { v: min },
      { v: max }
    ]

    if (res.length === 3) {
      expected.push({
        v: null
      })
    }

    expect(res).to.deep.equal(expected)
  }

  it('user bind DateTimeOffset to sql type DateTimeOffset - provide offset of 60 minutes', async function handler () {
    const offset = 60
    const scale = 7
    const smalldt = env.timeHelper.getUTCTodayHHMSS(14, 0, 0)
    const expected = new Date(smalldt.getTime() - offset * 60000)
    expected.nanosecondsDelta = 0

    const params = {
      query: 'declare @v DateTimeOffset = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      expected: [
        expected,
        expected
      ],
      setter: v => {
        return env.sql.DateTimeOffset(v, scale, offset)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind UniqueIdentifier', async function handler () {
    const params = {
      query: 'declare @v uniqueidentifier = ?; select @v as v',
      min: 'F01251E5-96A3-448D-981E-0F99D789110D',
      max: '45E8F437-670D-4409-93CB-F9424A40D6EE',
      setter: v => {
        return env.sql.UniqueIdentifier(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind time', async function handler () {
    const timeOnly = env.timeHelper.getUTCTime1970HHMMSSMS()
    timeOnly.nanosecondsDelta = 0

    const params = {
      query: 'declare @v time = ?; select @v as v',
      min: timeOnly,
      max: timeOnly,
      expected: [
        timeOnly,
        timeOnly
      ],
      setter: v => {
        return env.sql.Time(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  async function timeTest (n) {
    const timeOnly = n > 0
      ? env.timeHelper.getUTCTime1970HHMMSSMS()
      : env.timeHelper.getUTCTime1970HHMMSS()
    timeOnly.nanosecondsDelta = 0

    const params = {
      query: `declare @v time(${n}) = ?; select @v as v`,
      min: timeOnly,
      max: timeOnly,
      expected: [
        timeOnly,
        timeOnly
      ],
      setter: v => {
        return env.sql.Time(v, n)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  }

  it('user bind time(0)', async function handler () {
    await timeTest(0)
  })

  it('user bind time(7)', async function handler () {
    await timeTest(7)
  })

  it('user bind time(6)', async function handler () {
    await timeTest(6)
  })

  it('user bind time(5)', async function handler () {
    await timeTest(5)
  })

  it('user bind time(4)', async function handler () {
    await timeTest(4)
  })

  it('user bind time(3)', async function handler () {
    await timeTest(3)
  })

  it('user bind DateTime2 to sql type datetime2(7) - with scale set to illegal value, should error', async function handler () {
    const now = new Date()
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: v => {
        return env.sql.DateTime2(v, 8) // set scale illegal
      }
    }
    await expect(testUserBindAsync(params))
      .to.be.rejectedWith('Invalid precision value')
  })

  it('user bind DateTime2 to sql type datetime2(7) - with scale set too low, should error', async function handler () {
    const jsonDate = '2011-05-26T07:56:00.123Z'
    const then = new Date(jsonDate)
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: then,
      max: then,
      setter: v => {
        return env.sql.DateTime2(v, 1) // set scale too low
      }
    }
    await expect(testUserBindAsync(params))
      .to.be.rejectedWith('Fractional second precision exceeds the scale specified')
  })

  function repeat (a, num) {
    return new Array(num + 1).join(a)
  }

  it('user bind WLongVarChar to NVARCHAR(MAX)', async function handler () {
    const smallLen = 2200
    const largeLen = 8200
    const params = {
      query: 'declare @v NVARCHAR(MAX) = ?; select @v as v',
      min: repeat('N', smallLen),
      max: repeat('X', largeLen),
      test_null: false,
      setter: v => {
        return env.sql.WLongVarChar(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind DateTimeOffset to sql type DateTimeOffset - no offset ', async function handler () {
    const now = new Date()
    const smalldt = new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      14,
      0,
      0,
      0))
    smalldt.nanosecondsDelta = 0
    const params = {
      query: 'declare @v DateTimeOffset = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      setter: v => {
        return env.sql.DateTimeOffset(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind SmallDateTime to sql type smalldatetime', async function handler () {
    const now = new Date()
    const smalldt = env.timeHelper.getUTCDateHHMM(now)
    smalldt.nanosecondsDelta = 0
    const params = {
      query: 'declare @v smalldatetime = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      setter: v => {
        return env.sql.SmallDateTime(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind DateTime2 to sql type datetime2(7) default scale', async function handler () {
    const now = new Date()
    now.nanosecondsDelta = 0
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: v => {
        return env.sql.DateTime2(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind DateTime2 to sql type datetime2(7) - with scale set correctly, should pass', async function handler () {
    const now = new Date()
    now.nanosecondsDelta = 0
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: v => {
        return env.sql.DateTime2(v, 3) // set scale just right for ms
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind DateTime to sql type datetime2(7)', async function handler () {
    const now = new Date()
    now.nanosecondsDelta = 0
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: v => {
        return env.sql.DateTime(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind DateTime to sql type datetime - driver currently only supports 10ms accuracy with datetime', async function handler () {
    const now = env.sql.DateRound()
    now.nanosecondsDelta = 0
    const params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: v => {
        return env.sql.DateTime(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Date', async function handler () {
    const today = new Date()
    const dateOnly = env.timeHelper.getUTCDate()
    dateOnly.nanosecondsDelta = 0
    const params = {
      query: 'declare @v date = ?; select @v as v',
      min: today,
      max: today,
      expected: [
        dateOnly,
        dateOnly
      ],
      setter: v => {
        return env.sql.Date(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Xml - well formatted.', async function handler () {
    const params = {
      query: 'declare @v xml = ?; select @v as v',
      min: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car></Cars>',
      max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car><Car id="5678"><Make>Honda</Make><Model>CRV</Model><Year>2009</Year><Color>Black</Color><Mileage>35,600</Mileage></Car></Cars>',
      setter: v => {
        return env.sql.Xml(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Xml - bad xml should give error', async function handler () {
    const params = {
      query: 'declare @v xml = ?; select @v as v',
      min: '',
      max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Cars>',
      setter: v => {
        return env.sql.Xml(v)
      }
    }
    await expect(testUserBindAsync(params)).to.be.rejectedWith('end tag does not match start tag')
  })

  it('user bind nchar - check truncated user strings (1)', async function handler () {
    const params = {
      query: 'declare @v nchar(5) = ?; select @v as v',
      min: 'five',
      max: 'hello world',
      expected: [
        'five ',
        'hello'
      ],

      setter: v => {
        return env.sql.NChar(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Char - check truncated user strings (1)', async function handler () {
    const params = {
      query: 'declare @v char(5) = ?; select @v as v',
      min: 'five',
      max: 'hello world',
      expected: [
        'five ',
        'hello'
      ],
      setter: v => {
        return env.sql.Char(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Char - returned string will be padded (2)', async function handler () {
    const params = {
      query: 'declare @v char(5) = ?; select @v as v',
      min: 'h',
      max: 'world',
      expected: [
        'h    ',
        'world'
      ],
      setter: v => {
        return env.sql.Char(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Char - use precision to clip user string (3)', async function handler () {
    const params = {
      query: 'declare @v char(11) = ?; select @v as v',
      min: 'h',
      max: 'world',
      expected: [
        'h' + new Array(11).join(' '),
        'wo' + new Array(10).join(' ')
      ],
      setter: v => {
        return env.sql.Char(v, 2)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind NVarChar /16 bit encoded', async function handler () {
    const params = {
      query: 'declare @v varchar(100) = ?; select @v as v',
      min: 'hello',
      max: 'world',
      expected: [
        'hello',
        'world'
      ],
      setter: v => {
        return env.sql.NVarChar(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Float, maps to numeric data structure.', async function handler () {
    const params = {
      query: 'declare @v float = ?; select @v as v',
      // eslint-disable-next-line no-loss-of-precision
      min: -1.7976931348623158E+308,
      // eslint-disable-next-line no-loss-of-precision
      max: 1.7976931348623158E+308,
      setter: v => {
        return env.sql.Float(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Double, maps to numeric data structure.', async function handler () {
    const params = {
      query: 'declare @v float = ?; select @v as v',
      // eslint-disable-next-line no-loss-of-precision
      min: -1.7976931348623158E+308,
      // eslint-disable-next-line no-loss-of-precision
      max: 1.7976931348623158E+308,
      setter: v => {
        return env.sql.Float(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Bit', async function handler () {
    const params = {
      query: 'declare @v bit = ?; select @v as v',
      min: false,
      max: true,
      setter: v => {
        return env.sql.Bit(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind BigInt', async function handler () {
    const params = {
      query: 'declare @v bigint = ?; select @v as v',
      min: -9007199254740991,
      max: 9007199254740991,
      setter: v => {
        return env.sql.BigInt(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind Int', async function handler () {
    const params = {
      query: 'declare @v int = ?; select @v as v',
      min: -2147483648,
      max: 2147483647,
      setter: v => {
        return env.sql.Int(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind TinyInt', async function handler () {
    const params = {
      query: 'declare @v tinyint = ?; select @v as v',
      min: 0,
      max: 255,
      setter: v => {
        return env.sql.TinyInt(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })

  it('user bind SmallInt', async function handler () {
    const params = {
      query: 'declare @v smallint = ?; select @v as v',
      min: -32768,
      max: 32767,
      setter: v => {
        return env.sql.SmallInt(v)
      }
    }
    const res = await testUserBindAsync(params)
    compare(params, res)
  })
})
