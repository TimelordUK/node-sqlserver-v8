'use strict'

// benchmark.js — insert / select throughput for msnodesqlv8
//
// Measures three insert strategies plus a select readback across a
// sweep of row counts. Emits a markdown table suitable for pasting
// into README / release notes.
//
//   node benchmark.js --rows 1000,10000,100000 --modes bulk,bcp,prepared,select
//
// Honest-OLTP schema: 13 cols, ~240 bytes/row, covers int/bigint/
// varchar/nvarchar/datetime2/decimal/bit/null binder paths.
// No LOBs, PK only, no secondary indexes.

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const sql = env.sql
const connectionString = env.connectionString

// ── args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function flag (name, fb) { const i = args.indexOf(name); return i === -1 ? fb : args[i + 1] }
function hasFlag (name) { return args.indexOf(name) !== -1 }

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Usage: node benchmark.js [options]

Options:
  --rows <list>      Comma list of row counts       (default 1000,10000,100000)
  --modes <list>     bulk,bcp,prepared,select       (default bulk,bcp,prepared,select)
  --runs <N>         Timed runs per cell, median    (default 3)
  --warmup           Discard one warmup run         (default on)
  --no-warmup        Skip warmup
  --table <name>     Table name                     (default bench_trade)
  --select-batch <N> Row count for select bench     (default max of --rows)
  --verbose          Library TRACE logging

Insert modes:
  bulk       BulkTableOpMgr array-bind (the recommended fast path)
  bcp        Same bind, setUseBcp(true) — needs ODBC 17/18
  prepared   Row-by-row prepared INSERT — baseline to show *why* bulk matters

Select mode:
  select     Inserts --select-batch rows via bulk, then times SELECT *
             both as a materialised array and via streaming events.
`)
  process.exit(0)
}

const rowCounts = (flag('--rows', '1000,10000,100000')).split(',').map(s => parseInt(s.trim(), 10))
const modes = (flag('--modes', 'bulk,bcp,prepared,select')).split(',').map(s => s.trim())
const runs = parseInt(flag('--runs', '3'), 10)
const warmup = !hasFlag('--no-warmup')
const tableName = flag('--table', 'bench_trade')
const selectBatch = parseInt(flag('--select-batch', String(Math.max(...rowCounts))), 10)
const verbose = hasFlag('--verbose')

if (verbose) {
  sql.logger.setLogLevel(sql.LogLevel.TRACE)
  sql.logger.setConsoleLogging(true)
}

// ── schema ──────────────────────────────────────────────────────────

const columns = [
  { name: 'id',          type: 'BIGINT PRIMARY KEY' },
  { name: 'trade_date',  type: 'DATETIME2' },
  { name: 'symbol',      type: 'VARCHAR(12)' },
  { name: 'client_name', type: 'NVARCHAR(64)' },
  { name: 'quantity',    type: 'INT' },
  { name: 'price',       type: 'DECIMAL(18,4)' },
  { name: 'commission',  type: 'DECIMAL(18,4)' },
  { name: 'settled',     type: 'BIT' },
  { name: 'currency',    type: 'CHAR(3)' },
  { name: 'venue',       type: 'VARCHAR(16)' },
  { name: 'notes',       type: 'NVARCHAR(128) NULL' },
  { name: 'created_at',  type: 'DATETIME2' },
  { name: 'updated_at',  type: 'DATETIME2' },
  { name: 'version',     type: 'INT' }
]

const SYMBOLS = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B']
const CCY     = ['USD', 'EUR', 'GBP', 'JPY']
const VENUES  = ['NYSE', 'NASDAQ', 'LSE', 'XETRA', 'TSE']

function makeRow (i) {
  const now = new Date(Date.UTC(2026, 0, 1) + i * 1000)
  return {
    id: i,
    trade_date: now,
    symbol: SYMBOLS[i % SYMBOLS.length],
    client_name: `Client_${i}_longer_name_padding`,
    quantity: (i % 10000) + 1,
    price: 100 + (i % 1000) / 10,
    commission: ((i % 500) / 100),
    settled: (i & 1) === 0,
    currency: CCY[i % CCY.length],
    venue: VENUES[i % VENUES.length],
    notes: (i % 10 === 0) ? null : `note ${i}`,
    created_at: now,
    updated_at: now,
    version: 1
  }
}

function buildRows (n) {
  const rows = new Array(n)
  for (let i = 0; i < n; i++) rows[i] = makeRow(i)
  return rows
}

// ── DDL ─────────────────────────────────────────────────────────────

const colDdl       = columns.map(c => `${c.name} ${c.type}`).join(', ')
const insertCols   = columns.map(c => c.name).join(', ')
const insertParams = columns.map(_ => '?').join(', ')
const dropSql      = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`
const createSql    = `CREATE TABLE ${tableName} (${colDdl})`
const insertOneSql = `INSERT INTO ${tableName} (${insertCols}) VALUES (${insertParams})`

async function resetTable (conn) {
  await conn.promises.query(dropSql)
  await conn.promises.query(createSql)
}

// ── timing helpers ──────────────────────────────────────────────────

function hrms () { return Number(process.hrtime.bigint()) / 1e6 }
function median (xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

function fmt (n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}

// ── insert modes ────────────────────────────────────────────────────

async function runBulk (conn, rows, useBcp) {
  await resetTable(conn)
  const table = await conn.promises.getTable(tableName)
  if (useBcp) table.setUseBcp(true)
  const t0 = hrms()
  await table.promises.insert(rows)
  return hrms() - t0
}

async function runPrepared (conn, rows) {
  await resetTable(conn)
  const prepared = await conn.promises.prepare(insertOneSql)
  const t0 = hrms()
  for (const r of rows) {
    await prepared.promises.query([
      r.id, r.trade_date, r.symbol, r.client_name, r.quantity, r.price,
      r.commission, r.settled, r.currency, r.venue, r.notes,
      r.created_at, r.updated_at, r.version
    ])
  }
  const ms = hrms() - t0
  await prepared.promises.free()
  return ms
}

async function runSelectMaterialised (conn, n) {
  const t0 = hrms()
  const res = await conn.promises.query(`SELECT TOP ${n} ${insertCols} FROM ${tableName}`)
  const ms = hrms() - t0
  if (!res.first || res.first.length !== n) {
    throw new Error(`expected ${n} rows, got ${res.first ? res.first.length : 0}`)
  }
  return ms
}

function runSelectStreaming (conn, n) {
  return new Promise((resolve, reject) => {
    const t0 = hrms()
    let rowCount = 0
    const q = conn.query(`SELECT TOP ${n} ${insertCols} FROM ${tableName}`)
    q.on('row', () => { rowCount++ })
    q.on('error', reject)
    q.on('done', () => {
      if (rowCount !== n) return reject(new Error(`expected ${n} streamed, got ${rowCount}`))
      resolve(hrms() - t0)
    })
  })
}

// ── sweep driver ────────────────────────────────────────────────────

async function timeCell (fn) {
  const samples = []
  if (warmup) { await fn() }
  for (let i = 0; i < runs; i++) samples.push(await fn())
  return { med: median(samples), samples }
}

function line (cols, widths) {
  return '| ' + cols.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |'
}

async function main () {
  const conn = await sql.promises.open(connectionString)

  // calibration / environment report
  const rtt = await (async () => {
    const t0 = hrms()
    await conn.promises.query('SELECT 1 AS ping')
    return hrms() - t0
  })()
  const verRes = await conn.promises.query('SELECT @@VERSION AS v')
  const serverVersion = verRes.first[0].v.split('\n')[0]

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  msnodesqlv8 benchmark')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  server      : ${serverVersion}`)
  console.log(`  rtt (ping)  : ${rtt.toFixed(2)} ms`)
  console.log(`  node        : ${process.version}`)
  console.log(`  platform    : ${process.platform} ${process.arch}`)
  console.log(`  schema      : ${columns.length} cols (${tableName})`)
  console.log(`  row counts  : ${rowCounts.join(', ')}`)
  console.log(`  modes       : ${modes.join(', ')}`)
  console.log(`  runs/cell   : ${runs}${warmup ? ' (+1 warmup)' : ''}`)
  console.log('═══════════════════════════════════════════════════════\n')

  const results = []  // { mode, rows, ms, rps }

  async function timeMode (mode, n, fn) {
    process.stdout.write(`  ${mode.padEnd(14)} rows=${fmt(n).padStart(6)}  ... `)
    try {
      const { med } = await timeCell(fn)
      const rps = n / (med / 1000)
      results.push({ mode, rows: n, ms: med, rps })
      console.log(`${med.toFixed(1).padStart(8)} ms   ${fmt(rps).padStart(7)} rows/s`)
    } catch (e) {
      console.log(`FAIL: ${e.message}`)
    }
  }

  // Run select FIRST (after a single bulk load) so we always get select
  // numbers even if later modes are slow and the user aborts.
  if (modes.includes('select')) {
    console.log(`  loading ${selectBatch} rows (bcp) for select benchmark...`)
    await runBulk(conn, buildRows(selectBatch), true)  // bcp for fast setup
    await timeMode('select-array',  selectBatch, () => runSelectMaterialised(conn, selectBatch))
    await timeMode('select-stream', selectBatch, () => runSelectStreaming(conn, selectBatch))
    console.log()
  }

  // insert modes sweep
  for (const mode of modes) {
    if (mode === 'select') continue
    for (const n of rowCounts) {
      // prepared is the per-row baseline — cap it aggressively
      if (mode === 'prepared' && n > 5000) {
        console.log(`  ${mode.padEnd(14)} rows=${fmt(n).padStart(6)}  ... skipped (baseline only, too slow)`)
        continue
      }
      const rows = buildRows(n)
      let fn
      if (mode === 'bulk')          fn = () => runBulk(conn, rows, false)
      else if (mode === 'bcp')      fn = () => runBulk(conn, rows, true)
      else if (mode === 'prepared') fn = () => runPrepared(conn, rows)
      else { console.log(`  ${mode}: unknown, skipping`); continue }
      await timeMode(mode, n, fn)
    }
  }

  // post-run row-size calibration
  let avgBytes = null
  try {
    const r = await conn.promises.query(
      `EXEC sp_spaceused '${tableName}'`)
    // sp_spaceused returns e.g. data="1234 KB" and rows
    const rec = r.first[0]
    const dataKb = parseInt(String(rec.data).replace(/[^0-9]/g, ''), 10)
    const nrows  = parseInt(String(rec.rows).replace(/[^0-9]/g, ''), 10)
    if (nrows > 0) avgBytes = (dataKb * 1024) / nrows
  } catch (_) { /* ignore */ }

  // markdown report
  console.log('\n### Results\n')
  const widths = [14, 10, 12, 14, 14]
  console.log(line(['mode', 'rows', 'median ms', 'rows/sec', 'MB/sec'], widths))
  console.log(line(['-'.repeat(14), '-'.repeat(10), '-'.repeat(12), '-'.repeat(14), '-'.repeat(14)], widths))
  for (const r of results) {
    const mbs = avgBytes ? ((r.rps * avgBytes) / (1024 * 1024)).toFixed(2) : '—'
    console.log(line([r.mode, r.rows, r.ms.toFixed(1), fmt(r.rps), mbs], widths))
  }
  console.log()
  if (avgBytes) console.log(`avg row size (sp_spaceused): ${avgBytes.toFixed(1)} bytes`)
  console.log(`rtt: ${rtt.toFixed(2)} ms   server: ${serverVersion}`)

  // cleanup
  await conn.promises.query(dropSql)
  await conn.promises.close()
}

main().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
