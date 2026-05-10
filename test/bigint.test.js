// ---------------------------------------------------------------------------------------------------------------------------------
// File: bigint.test.js
// Contents: probes how SQL BIGINT is materialised on the JS side.
//
// Background (issue #400): SQL BIGINT is a signed 64-bit integer, but JS
// Number is float64, which silently loses precision above 2^53. v5 of the
// driver adds an opt-in flag — bigint_as_native (per query) or
// useBigIntAsNative (per connection / pool) — that returns SQL BIGINT
// columns as native JS BigInt values. The legacy Number path remains the
// default for the v5 line; the flag will become the default in v6.
//
// Precedence: useNumericString (string) > useBigIntAsNative (BigInt) > Number.
// ---------------------------------------------------------------------------------------------------------------------------------

/* globals describe it before */
'use strict'

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'

const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const assert = chai.assert
const expect = chai.expect

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

describe('bigint return type', function () {
  this.timeout(30000)

  // SQL BIGINT range is signed 64-bit: [-2^63, 2^63 - 1].
  // JS Number can only represent integers exactly up to ±(2^53 - 1).
  const SAMPLES = {
    zero: '0',
    smallPositive: '42',
    smallNegative: '-42',
    maxSafeInteger: '9007199254740991', // 2^53 - 1, last exact Number
    justAboveMaxSafe: '9007199254740993', // 2^53 + 1, first int Number cannot represent
    sqlBigIntMax: '9223372036854775807', // 2^63 - 1
    sqlBigIntMin: '-9223372036854775808' // -2^63
  }

  this.beforeEach(async function () {
    await env.open()
  })

  this.afterEach(async function () {
    await env.close()
  })

  // ----------------------------------------------------------------------
  // Default behaviour (no flag set): legacy Number path. Document the
  // silent precision loss explicitly so any future change is a visible diff.
  // ----------------------------------------------------------------------
  describe('default (legacy Number) return path', function () {
    it('returns small BIGINT as Number', async function () {
      const r = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.smallPositive} AS bigint) AS v`
      )
      assert.strictEqual(typeof r.first[0].v, 'number')
      assert.strictEqual(r.first[0].v, 42)
    })

    it('returns Number.MAX_SAFE_INTEGER exactly', async function () {
      const r = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.maxSafeInteger} AS bigint) AS v`
      )
      assert.strictEqual(r.first[0].v, Number.MAX_SAFE_INTEGER)
    })

    it('LOSES PRECISION for 2^53 + 1 (silent corruption — the bug)', async function () {
      const r = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.justAboveMaxSafe} AS bigint) AS v`
      )
      assert.strictEqual(typeof r.first[0].v, 'number')
      assert.notStrictEqual(BigInt(r.first[0].v).toString(), SAMPLES.justAboveMaxSafe)
      assert.strictEqual(r.first[0].v, Math.pow(2, 53))
    })
  })

  // ----------------------------------------------------------------------
  // bigint_as_native — query-level opt-in.
  // ----------------------------------------------------------------------
  describe('per-query bigint_as_native flag', function () {
    it('returns small BIGINT as native BigInt', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.smallPositive} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'bigint')
      assert.strictEqual(r.first[0].v, 42n)
    })

    it('preserves precision at 2^53 + 1', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.justAboveMaxSafe} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'bigint')
      assert.strictEqual(r.first[0].v.toString(), SAMPLES.justAboveMaxSafe)
    })

    it('preserves precision at SQL BIGINT max (2^63 - 1)', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.strictEqual(r.first[0].v.toString(), SAMPLES.sqlBigIntMax)
    })

    it('preserves precision at SQL BIGINT min (-2^63)', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.sqlBigIntMin} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.strictEqual(r.first[0].v.toString(), SAMPLES.sqlBigIntMin)
    })

    it('does not affect plain INT columns', async function () {
      // Targeted at BIGINT only, unlike useNumericString which sweeps everything.
      const r = await env.theConnection.promises.query({
        query_str: 'SELECT CAST(7 AS int) AS v',
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'number')
      assert.strictEqual(r.first[0].v, 7)
    })

    it('does not affect DECIMAL columns whose value happens to be whole', async function () {
      // BigIntColumn is allocated internally for whole-numbered decimals,
      // but the column's source type is DECIMAL so it must still surface
      // as Number — we don't want users to get BigInt from a DECIMAL(18,4).
      const r = await env.theConnection.promises.query({
        query_str: 'SELECT CAST(123 AS decimal(18, 4)) AS v',
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'number')
      assert.strictEqual(r.first[0].v, 123)
    })
  })

  // ----------------------------------------------------------------------
  // useBigIntAsNative — connection-level setter, applies to every query
  // until cleared.
  // ----------------------------------------------------------------------
  describe('per-connection setUseBigIntAsNative', function () {
    it('returns BigInt for every BIGINT query once enabled', async function () {
      env.theConnection.setUseBigIntAsNative(true)
      assert.strictEqual(env.theConnection.getUseBigIntAsNative(), true)

      const a = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`
      )
      const b = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.smallNegative} AS bigint) AS v`
      )

      assert.strictEqual(typeof a.first[0].v, 'bigint')
      assert.strictEqual(a.first[0].v.toString(), SAMPLES.sqlBigIntMax)
      assert.strictEqual(typeof b.first[0].v, 'bigint')
      assert.strictEqual(b.first[0].v, -42n)
    })

    it('reverts to Number when disabled mid-session', async function () {
      env.theConnection.setUseBigIntAsNative(true)
      env.theConnection.setUseBigIntAsNative(false)
      const r = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.smallPositive} AS bigint) AS v`
      )
      assert.strictEqual(typeof r.first[0].v, 'number')
    })

    it('per-query flag overrides connection default', async function () {
      env.theConnection.setUseBigIntAsNative(false)
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.smallPositive} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'bigint')
    })
  })

  // ----------------------------------------------------------------------
  // Precedence — useNumericString must keep winning over the new flag.
  // ----------------------------------------------------------------------
  describe('precedence: numeric_string overrides bigint_as_native', function () {
    it('per-query: numeric_string wins when both are set', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`,
        numeric_string: true,
        bigint_as_native: true
      })
      assert.strictEqual(typeof r.first[0].v, 'string')
      assert.strictEqual(r.first[0].v, SAMPLES.sqlBigIntMax)
    })

    it('connection-level: numeric_string wins when both are set', async function () {
      env.theConnection.setUseNumericString(true)
      env.theConnection.setUseBigIntAsNative(true)
      const r = await env.theConnection.promises.query(
        `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`
      )
      assert.strictEqual(typeof r.first[0].v, 'string')
      assert.strictEqual(r.first[0].v, SAMPLES.sqlBigIntMax)
    })
  })

  // ----------------------------------------------------------------------
  // Round-trip: a BigInt that came back from a row should be bindable
  // straight back into the next query as a parameter (issue #400 part b).
  // ----------------------------------------------------------------------
  describe('parameter binding accepts BigInt', function () {
    it('binds a BigInt literal as a BIGINT parameter', async function () {
      const r = await env.theConnection.promises.query({
        query_str: 'SELECT CAST(? AS bigint) AS v',
        bigint_as_native: true
      }, [42n])
      assert.strictEqual(typeof r.first[0].v, 'bigint')
      assert.strictEqual(r.first[0].v, 42n)
    })

    it('round-trips a max-precision value via the result row', async function () {
      const select = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`,
        bigint_as_native: true
      })
      const got = select.first[0].v
      assert.strictEqual(typeof got, 'bigint')

      // Hand the BigInt straight back into the next query, no string coercion.
      const echo = await env.theConnection.promises.query({
        query_str: 'SELECT CAST(? AS bigint) AS v',
        bigint_as_native: true
      }, [got])
      assert.strictEqual(echo.first[0].v.toString(), SAMPLES.sqlBigIntMax)
    })

    it('binds a BigInt typed via sql.BigInt() wrapper', async function () {
      const r = await env.theConnection.promises.query({
        query_str: 'SELECT CAST(? AS bigint) AS v',
        bigint_as_native: true
      }, [sql.BigInt(7n)])
      assert.strictEqual(r.first[0].v, 7n)
    })
  })

  // ----------------------------------------------------------------------
  // Consumer caveat: JSON.stringify cannot serialise a BigInt and
  // throws by spec. Document this so it's a known property of opting in.
  // ----------------------------------------------------------------------
  describe('JSON serialisation caveat', function () {
    it('JSON.stringify throws on a row with a BigInt column', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.smallPositive} AS bigint) AS v`,
        bigint_as_native: true
      })
      assert.throws(() => JSON.stringify(r.first[0]), /BigInt/)
    })

    it('users can stringify by adding a BigInt-aware replacer', async function () {
      const r = await env.theConnection.promises.query({
        query_str: `SELECT CAST(${SAMPLES.sqlBigIntMax} AS bigint) AS v`,
        bigint_as_native: true
      })
      const json = JSON.stringify(r.first[0],
        (_k, v) => typeof v === 'bigint' ? v.toString() : v)
      expect(json).to.equal(`{"v":"${SAMPLES.sqlBigIntMax}"}`)
    })
  })

  // ----------------------------------------------------------------------
  // Bulk insert: rows are mapped JS-side into per-column arrays, then sent
  // via the typed bulk binding path. With BigInt elements in the input
  // rows, this exercises bind_integer_array's BigInt branch.
  // ----------------------------------------------------------------------
  describe('bulk insert with BigInt values', function () {
    const tableName = 'bulk_bigint_test'

    async function dropTable () {
      await env.theConnection.promises.query(
        `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`)
    }

    it('round-trips BigInt values exceeding 2^53 through bulk insert', async function () {
      await dropTable()
      await env.theConnection.promises.query(
        `CREATE TABLE ${tableName} (id int identity primary key, v bigint not null)`)

      const bulkMgr = await env.theConnection.promises.getTable(tableName)
      // Pick values that lie above MAX_SAFE_INTEGER so any precision loss
      // would manifest as a mismatch when read back with native BigInt.
      const rows = [
        { v: BigInt(SAMPLES.sqlBigIntMax) },
        { v: BigInt(SAMPLES.justAboveMaxSafe) },
        { v: BigInt(SAMPLES.sqlBigIntMin) + 1n },
        { v: 0n }
      ]
      await bulkMgr.promises.insert(rows)

      const r = await env.theConnection.promises.query({
        query_str: `SELECT v FROM ${tableName} ORDER BY id`,
        bigint_as_native: true
      })
      const got = r.first.map(row => row.v.toString())
      assert.deepStrictEqual(got, rows.map(r => r.v.toString()))

      await dropTable()
    })
  })

  // ----------------------------------------------------------------------
  // Stored procedure: a proc with a bigint input parameter must accept a
  // JS BigInt argument. Tests both bare-array call (callProc) which goes
  // through the typed proc-meta path, and direct query-with-? binding.
  // ----------------------------------------------------------------------
  describe('stored procedure with bigint parameter', function () {
    const spName = 'test_sp_bigint_echo'

    async function dropProc () {
      await env.theConnection.promises.query(
        `IF EXISTS (SELECT * FROM sys.objects WHERE type='P' AND OBJECT_ID = OBJECT_ID('${spName}'))
         DROP PROCEDURE ${spName}`)
    }

    it('accepts a BigInt parameter and returns the echoed value', async function () {
      await dropProc()
      await env.theConnection.promises.query(
        `CREATE PROCEDURE ${spName}(@v bigint, @out bigint OUTPUT)
         AS BEGIN SET @out = @v END`)

      env.theConnection.setUseBigIntAsNative(true)
      const promises = env.theConnection.promises
      const res = await promises.callProc(spName, [BigInt(SAMPLES.sqlBigIntMax)])
      // res.output[0] is the auto-prepended @___return___ (int), res.output[1]
      // is the first user OUTPUT param.
      assert.strictEqual(typeof res.output[1], 'bigint',
        'output bigint param must surface as native BigInt')
      assert.strictEqual(res.output[1].toString(), SAMPLES.sqlBigIntMax)

      await dropProc()
    })

    it('binds BigInt via direct EXEC with ? parameter', async function () {
      await dropProc()
      await env.theConnection.promises.query(
        `CREATE PROCEDURE ${spName}(@v bigint)
         AS BEGIN SELECT @v + 1 AS next_v END`)

      const r = await env.theConnection.promises.query({
        query_str: `EXEC ${spName} ?`,
        bigint_as_native: true
      }, [BigInt(SAMPLES.justAboveMaxSafe)])
      assert.strictEqual(r.first[0].next_v.toString(),
        (BigInt(SAMPLES.justAboveMaxSafe) + 1n).toString())

      await dropProc()
    })
  })

  // ----------------------------------------------------------------------
  // TVP: a table-valued parameter whose schema contains a bigint column
  // must accept BigInt values in the row payload. Each TVP column is
  // bound through user_bind/sql_bigint -> bind_integer_array, the same
  // path bulk uses.
  // ----------------------------------------------------------------------
  describe('TVP with bigint column', function () {
    const typeName = 'tvp_bigint_type'
    const tableName = 'tvp_bigint_table'
    const procName = 'tvp_bigint_insert'

    async function cleanup () {
      const sql = env.theConnection.promises
      await sql.query(`IF OBJECT_ID('${procName}', 'P') IS NOT NULL DROP PROCEDURE ${procName}`)
      await sql.query(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`)
      await sql.query(`IF TYPE_ID(N'${typeName}') IS NOT NULL DROP TYPE ${typeName}`)
    }

    it('round-trips BigInt values through a bigint TVP column', async function () {
      await cleanup()
      const sql = env.theConnection.promises
      await sql.query(`CREATE TABLE ${tableName} (id int identity primary key, v bigint not null)`)
      await sql.query(`CREATE TYPE ${typeName} AS TABLE (v bigint)`)
      await sql.query(
        `CREATE PROCEDURE ${procName} @tvp ${typeName} READONLY
         AS BEGIN INSERT INTO ${tableName} (v) SELECT v FROM @tvp END`)

      // Fetch the user-defined type metadata, populate it, wrap as a TVP.
      const tvpTable = await env.theConnection.promises.getUserTypeTable(typeName)
      const samples = [
        BigInt(SAMPLES.sqlBigIntMax),
        BigInt(SAMPLES.sqlBigIntMin) + 1n,
        BigInt(SAMPLES.justAboveMaxSafe),
        7n
      ]
      tvpTable.addRowsFromObjects(samples.map(v => ({ v })))
      const tvp = env.sql.TvpFromTable(tvpTable)

      await env.theConnection.promises.callProc(procName, [tvp])

      const r = await env.theConnection.promises.query({
        query_str: `SELECT v FROM ${tableName} ORDER BY id`,
        bigint_as_native: true
      })
      const got = r.first.map(row => row.v.toString())
      assert.deepStrictEqual(got, samples.map(v => v.toString()))

      await cleanup()
    })
  })
})
