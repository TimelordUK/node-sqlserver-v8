'use strict'

// regression: string OUTPUT parameters on stored procedures.
//  - nvarchar / nchar / ntext outputs were bound as varbinary ("Implicit conversion
//    from data type nvarchar to varbinary is not allowed")
//  - an output passed a value (input / output) had a buffer the size of that value,
//    so '' came back as '\x00' whatever the proc set

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const assert = require('chai').assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

const procName = 'test_sp_output_string'
const unicode = 'héllo wörld ✓'

describe('proc output string', function () {
  this.timeout(30000)

  this.beforeEach(async () => {
    await env.open()
  })

  this.afterEach(async () => {
    await env.close()
  })

  async function createProc (type) {
    const conn = env.theConnection
    await conn.promises.query(`if object_id('${procName}') is not null drop procedure ${procName}`)
    await conn.promises.query(`
      create procedure ${procName} @prefix nvarchar(20), @out ${type} output
      as
      begin
        set nocount on
        set @out = concat(@prefix, isnull(@out, ''))
        return 7
      end`)
    // the proc definition is cached, so drop it when the type changes
    conn.procedureMgr().clear()
  }

  async function call (params) {
    const res = await env.theConnection.promises.callProc(procName, params)
    assert.strictEqual(res.returns, 7)
    return res.output[1]
  }

  for (const type of ['varchar(100)', 'nvarchar(100)', 'char(20)', 'nchar(20)', 'varchar(max)', 'nvarchar(max)']) {
    const padded = type.startsWith('char') || type.startsWith('nchar')
    const expect = (got, want) => assert.strictEqual(padded ? got.trimEnd() : got, want)
    const asciiOnly = !type.startsWith('n')

    describe(type, () => {
      it('output omitted (object params)', async function handler () {
        await createProc(type)
        expect(await call({ prefix: 'abc' }), 'abc')
      })

      it('output omitted (array params)', async function handler () {
        await createProc(type)
        expect(await call(['abc']), 'abc')
      })

      it("output passed '' gets the value set by the proc", async function handler () {
        await createProc(type)
        expect(await call({ prefix: 'abc', out: '' }), 'abc')
      })

      it('output passed a value is read and replaced', async function handler () {
        await createProc(type)
        expect(await call({ prefix: 'abc', out: 'def' }), 'abcdef')
      })

      if (!asciiOnly) {
        it('unicode output', async function handler () {
          await createProc(type)
          expect(await call({ prefix: unicode }), unicode)
        })
      }
    })
  }

  it('nvarchar(100) output filled to its declared length', async function handler () {
    await createProc('nvarchar(100)')
    const prefix = 'x'.repeat(20)
    const out = 'y'.repeat(80)
    assert.strictEqual(await call({ prefix, out }), prefix + out)
  })
})
