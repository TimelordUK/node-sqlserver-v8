'use strict'

// A driver prefixes every diagnostic with its component chain, e.g.
// "[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]", and res.info reports the message
// with that chain removed. It used to be removed by cutting at the last ']' anywhere in the
// string, so any message carrying a bracket of its own lost everything up to it:
//
//   print 'select * from [dbo].[my_table]'   ->   ''
//   print 'ends with ]'                      ->   ''
//
// Generated SQL is largely bracketed identifiers, so this hit the common case, and it hit
// every caller of the promises api because they all aggregate through here.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const expect = chai.expect

const sql = require('../lib/sql')
const { stripDriverPrefix } = require('../lib/query-aggregator')
const { configureTestLogging } = require('./common/logging-helper')

configureTestLogging(sql)

const PREFIX_17 = '[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]'
const PREFIX_18 = '[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]'

describe('info-prefix', function () {
  // The conversion is a pure function, so most of this needs no server at all.
  describe('stripDriverPrefix', function () {
    it('removes the driver component chain', function handler () {
      expect(stripDriverPrefix(`${PREFIX_18}hello world!`)).to.equal('hello world!')
      expect(stripDriverPrefix(`${PREFIX_17}hello world!`)).to.equal('hello world!')
    })

    it('keeps a bracketed identifier in the message', function handler () {
      expect(stripDriverPrefix(`${PREFIX_18}select * from [dbo].[my_table]`))
        .to.equal('select * from [dbo].[my_table]')
    })

    it('keeps a message that opens with a bracketed identifier', function handler () {
      expect(stripDriverPrefix(`${PREFIX_18}[dbo].[t] is missing`))
        .to.equal('[dbo].[t] is missing')
    })

    it('keeps a message that ends with a bracket', function handler () {
      expect(stripDriverPrefix(`${PREFIX_18}ends with ]`)).to.equal('ends with ]')
    })

    it('removes the chain reported by other drivers and managers', function handler () {
      expect(stripDriverPrefix('[Microsoft][ODBC Driver Manager]Data source name not found'))
        .to.equal('Data source name not found')
      expect(stripDriverPrefix('[Microsoft][SQL Server Native Client 11.0][SQL Server]boom'))
        .to.equal('boom')
      expect(stripDriverPrefix('[unixODBC][Microsoft][ODBC Driver 18 for SQL Server]boom'))
        .to.equal('boom')
    })

    it('falls back to the leading chain for an unrecognised driver', function handler () {
      expect(stripDriverPrefix('[FreeTDS][SQL Server]boom')).to.equal('boom')
    })

    it('leaves a message with no prefix alone', function handler () {
      expect(stripDriverPrefix('no prefix here')).to.equal('no prefix here')
      expect(stripDriverPrefix('no prefix, but a bracket ]')).to.equal('no prefix, but a bracket ]')
      expect(stripDriverPrefix('')).to.equal('')
    })

    it('passes through anything that is not a string', function handler () {
      expect(stripDriverPrefix(undefined)).to.equal(undefined)
      expect(stripDriverPrefix(null)).to.equal(null)
    })
  })

  describe('against a server', function () {
    this.timeout(50000)

    this.beforeEach(async function () {
      await env.open()
    })

    this.afterEach(async function () {
      await env.close()
    })

    it('reports a printed statement with its brackets intact', async function handler () {
      const text = 'select * from [dbo].[my_table]'
      const res = await env.theConnection.promises.query(`print '${text}'`)
      expect(res.info).to.have.lengthOf(1)
      expect(res.info[0]).to.equal(text)
    })

    it('reports a printed message that ends with a bracket', async function handler () {
      const res = await env.theConnection.promises.query("print 'ends with ]'")
      expect(res.info[0]).to.equal('ends with ]')
    })

    it('still strips the prefix from an ordinary message', async function handler () {
      const res = await env.theConnection.promises.query("print 'hello world!'")
      expect(res.info[0]).to.equal('hello world!')
    })
  })
})
