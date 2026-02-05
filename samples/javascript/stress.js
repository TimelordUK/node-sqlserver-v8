'use strict'

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const sql = env.sql
const connectionString = env.connectionString

// ── argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag (name, fallback) {
  const i = args.indexOf(name)
  if (i === -1) return fallback
  return args[i + 1]
}

function hasFlag (name) {
  return args.indexOf(name) !== -1
}

const mode = flag('--mode', 'proc') // proc | connect | mixed
const timeout = parseInt(flag('--timeout', '20'), 10) // seconds
const iterations = flag('-n', null) // if set, overrides --timeout
const concurrency = parseInt(flag('--concurrency', '8'), 10)
const verbose = hasFlag('--verbose')

if (hasFlag('--help')) {
  console.log(`
Usage: node stress.js [options]

Stress test utility for msnodesqlv8 connection / statement lifecycle.

Modes:
  --mode proc      Parallel procedure calls, each on its own connection (default)
  --mode connect   Rapid open / close of connections
  --mode mixed     Mix of valid queries, invalid queries and close on same connection

Options:
  --timeout <s>      Run for N seconds (default 20)
  -n <count>         Run exactly N iterations (overrides --timeout)
  --concurrency <N>  Parallel operations per batch (default 8)
  --verbose          Enable library TRACE logging to console

Examples:
  node stress.js --mode proc --timeout 30
  node stress.js --mode connect -n 500 --concurrency 16
  node stress.js --mode mixed --timeout 60 --verbose
`)
  process.exit(0)
}

// ── logging setup ───────────────────────────────────────────────────

if (verbose) {
  sql.logger.setLogLevel(sql.LogLevel.TRACE)
  sql.logger.setConsoleLogging(true)
}

// ── stats ───────────────────────────────────────────────────────────

const stats = {
  iterations: 0,
  successes: 0,
  failures: 0,
  errors: [],
  startTime: null,
  batchTimes: []
}

function elapsed () {
  return ((Date.now() - stats.startTime) / 1000).toFixed(1)
}

function shouldContinue () {
  if (iterations !== null) {
    return stats.iterations < parseInt(iterations, 10)
  }
  return (Date.now() - stats.startTime) < timeout * 1000
}

function report (final) {
  const dur = ((Date.now() - stats.startTime) / 1000).toFixed(2)
  const rate = (stats.iterations / (dur || 1)).toFixed(1)
  const avg = stats.batchTimes.length
    ? (stats.batchTimes.reduce((a, b) => a + b, 0) / stats.batchTimes.length).toFixed(1)
    : '0'

  if (final) {
    console.log('\n══════════════════════════════════════════════')
    console.log('  STRESS TEST COMPLETE')
    console.log('══════════════════════════════════════════════')
    console.log(`  mode         : ${mode}`)
    console.log(`  concurrency  : ${concurrency}`)
    console.log(`  elapsed      : ${dur}s`)
    console.log(`  iterations   : ${stats.iterations}`)
    console.log(`  successes    : ${stats.successes}`)
    console.log(`  failures     : ${stats.failures}`)
    console.log(`  rate         : ${rate} iter/s`)
    console.log(`  avg batch    : ${avg}ms`)
    if (stats.errors.length > 0) {
      const unique = [...new Set(stats.errors.map(e => e.message || String(e)))]
      console.log(`  unique errors: ${unique.length}`)
      unique.slice(0, 10).forEach(e => console.log(`    - ${e}`))
    }
    console.log('══════════════════════════════════════════════')
    console.log(stats.failures === 0 ? '  PASS' : '  FAIL (had errors)')
    console.log('══════════════════════════════════════════════\n')
  } else {
    process.stdout.write(
      `\r  [${elapsed()}s] iterations=${stats.iterations}  ok=${stats.successes}  fail=${stats.failures}  rate=${rate}/s  `
    )
  }
}

// ── helpers ─────────────────────────────────────────────────────────

const spName = 'stress_test_sp'
const spDef = `CREATE PROCEDURE ${spName} @p1 INT, @p2 VARCHAR(50)
AS
BEGIN
  SELECT @p1 AS val, @p2 AS msg, NEWID() AS uid
  RETURN @p1
END`
const spDrop = `IF OBJECT_ID('${spName}', 'P') IS NOT NULL DROP PROCEDURE ${spName}`

async function ensureProc () {
  const conn = await sql.promises.open(connectionString)
  await conn.promises.query(spDrop)
  await conn.promises.query(spDef)
  await conn.promises.close()
}

// ── mode: proc ──────────────────────────────────────────────────────
// Each iteration: open connection, call stored proc, close connection
// Mirrors the reported crash scenario exactly.

async function stressProc () {
  await ensureProc()

  while (shouldContinue()) {
    const batch = []
    const batchStart = Date.now()

    for (let i = 0; i < concurrency; i++) {
      batch.push(procOneCall(stats.iterations + i))
    }

    const results = await Promise.allSettled(batch)
    const batchMs = Date.now() - batchStart
    stats.batchTimes.push(batchMs)

    for (const r of results) {
      stats.iterations++
      if (r.status === 'fulfilled') {
        stats.successes++
      } else {
        stats.failures++
        stats.errors.push(r.reason)
      }
    }
    report(false)
  }
}

function procOneCall (idx) {
  return new Promise((resolve, reject) => {
    sql.open(connectionString, (err, conn) => {
      if (err) return reject(err)
      const pm = conn.procedureMgr()
      pm.getProc(spName, (err, procedure) => {
        if (err) {
          conn.close(() => reject(err))
          return
        }
        const rows = []
        const q = procedure.call([idx, `iter_${idx}`])

        q.on('error', e => {
          conn.close(() => reject(e))
        })

        q.on('column', (_index, data) => {
          rows.push(data)
        })

        q.on('done', () => {
          conn.close((closeErr) => {
            if (closeErr) return reject(closeErr)
            resolve(rows)
          })
        })
      })
    })
  })
}

// ── mode: connect ───────────────────────────────────────────────────
// Rapid open / query / close to stress the connection lifecycle.

async function stressConnect () {
  while (shouldContinue()) {
    const batch = []
    const batchStart = Date.now()

    for (let i = 0; i < concurrency; i++) {
      batch.push(connectOneCycle())
    }

    const results = await Promise.allSettled(batch)
    const batchMs = Date.now() - batchStart
    stats.batchTimes.push(batchMs)

    for (const r of results) {
      stats.iterations++
      if (r.status === 'fulfilled') {
        stats.successes++
      } else {
        stats.failures++
        stats.errors.push(r.reason)
      }
    }
    report(false)
  }
}

async function connectOneCycle () {
  const conn = await sql.promises.open(connectionString)
  const res = await conn.promises.query('SELECT 1 AS probe')
  if (!res || !res.first || res.first[0].probe !== 1) {
    throw new Error('unexpected query result')
  }
  await conn.promises.close()
}

// ── mode: mixed ─────────────────────────────────────────────────────
// On each connection, fire a mix of valid queries, invalid queries,
// and close — designed to tease out cleanup races.

async function stressMixed () {
  await ensureProc()

  while (shouldContinue()) {
    const batch = []
    const batchStart = Date.now()

    for (let i = 0; i < concurrency; i++) {
      batch.push(mixedOneCycle(stats.iterations + i))
    }

    const results = await Promise.allSettled(batch)
    const batchMs = Date.now() - batchStart
    stats.batchTimes.push(batchMs)

    for (const r of results) {
      stats.iterations++
      if (r.status === 'fulfilled') {
        stats.successes++
      } else {
        stats.failures++
        stats.errors.push(r.reason)
      }
    }
    report(false)
  }
}

async function mixedOneCycle (idx) {
  const conn = await sql.promises.open(connectionString)

  // 1) valid query
  await conn.promises.query('SELECT @@version AS v')

  // 2) valid proc call
  await conn.promises.callProc(spName, [idx, 'mixed'])

  // 3) intentionally bad query — should return error, not crash
  try {
    await conn.promises.query('SELECT * FROM __nonexistent_table_12345__')
  } catch (_) {
    // expected
  }

  // 4) valid query after error to confirm connection still usable
  await conn.promises.query('SELECT 1 AS still_alive')

  // 5) close
  await conn.promises.close()
}

// ── main ────────────────────────────────────────────────────────────

async function main () {
  console.log(`\nStress test: mode=${mode} concurrency=${concurrency}` +
    (iterations !== null ? ` iterations=${iterations}` : ` timeout=${timeout}s`) +
    (verbose ? ' verbose=on' : ''))
  console.log(`Connection: ${connectionString}\n`)

  stats.startTime = Date.now()

  switch (mode) {
    case 'proc':
      await stressProc()
      break
    case 'connect':
      await stressConnect()
      break
    case 'mixed':
      await stressMixed()
      break
    default:
      console.error(`Unknown mode: ${mode}`)
      process.exit(1)
  }

  report(true)
  process.exit(stats.failures === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('\nFATAL:', err)
  report(true)
  process.exit(2)
})
