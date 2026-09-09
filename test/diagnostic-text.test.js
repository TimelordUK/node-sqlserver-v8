'use strict'

// Regression tests for issue #446 - PRINT / RAISERROR text arriving damaged.
//
// The diagnostic path used to keep only the low byte of each UTF-16 code unit, so U+017C
// (z with dot) arrived as '|' and U+0142 (l with stroke) as 'B', characters whose low byte
// was a control code vanished, a code unit whose low byte was 0x00 (U+0100) ended the
// message, and any record longer than the 10 * 1024 unit buffer was cut to 10239
// characters with no error. Result rows were never affected - only diagnostics.
//
// The text under test is written with \u escapes so these assertions do not depend on how
// this file's own encoding survives a round trip through an editor or a patch.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const expect = chai.expect

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

configureTestLogging(sql)

describe('diagnostic-text', function () {
  this.timeout(50000)

  this.beforeEach(async function () {
    await env.open()
  })

  this.afterEach(async function () {
    await env.close()
  })

  // "--lista producentow uzytkownika, wydajnosciowych, podwladnych" with its diacritics.
  // Used to arrive as "--lista producent<U+FFFD>w u|ytkownika, wydajno[ciowych, podwBadnych".
  it('keeps non ascii characters in a print message', async function handler () {
    const text = '--lista producent\u00F3w u\u017Cytkownika, wydajno\u015Bciowych, podw\u0142adnych'
    const res = await env.theConnection.promises.query(`print N'${text}'`)
    expect(res.info).to.have.lengthOf(1)
    expect(res.info[0]).to.equal(text)
  })

  // U+0105, U+0107 and U+0119 narrow to 0x05, 0x07 (BEL) and 0x19, so these used to be
  // dropped rather than replaced - a word that loses a letter reads as a typo in
  // somebody's procedure rather than as driver damage.
  it('keeps characters whose low byte is a control code', async function handler () {
    const text = 'znak\u0105 znak\u0107 znak\u0119'
    const res = await env.theConnection.promises.query(`print N'${text}'`)
    expect(res.info[0]).to.equal(text)
  })

  // The low byte of U+0100 is 0x00, which used to terminate the message.
  it('does not end a message at a code unit whose low byte is zero', async function handler () {
    const res = await env.theConnection.promises.query("print N'PRZED' + nchar(0x0100) + N'PO'")
    expect(res.info[0]).to.equal('PRZED\u0100PO')
  })

  // Longer than the 10 * 1024 unit buffer, and comfortably inside what the driver will
  // hand over for one diagnostic record, so the whole message must arrive. This used to
  // stop at 10239 characters, losing the tail out of the middle of a generated statement.
  it('reads a print message longer than the diagnostic buffer', async function handler () {
    const body = 'x'.repeat(12000)
    const expected = `${body}|END|`
    const res = await env.theConnection.promises.query(
      "declare @long nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 12000); " +
      "print cast(@long + N'|END|' as ntext)")
    expect(res.info).to.have.lengthOf(1)
    expect(res.info[0]).to.have.lengthOf(expected.length)
    expect(res.info[0]).to.equal(expected)
  })

  it('keeps non ascii characters in a raiserror message', async function handler () {
    const text = 'b\u0142\u0105d w procedurze'
    try {
      await env.theConnection.promises.query(`raiserror(N'${text}', 16, 1)`)
      expect.fail('raiserror should have produced an error')
    } catch (e) {
      expect(e.message).to.contain(text)
    }
  })
})
