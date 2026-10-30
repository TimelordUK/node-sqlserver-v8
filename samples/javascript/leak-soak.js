'use strict'

// Soak test for native memory leaks. Each scenario runs one operation many times on a
// long-lived connection, samples process memory after a forced GC at checkpoints, and
// reports the growth per operation once warmed up. A leak shows as a steady slope;
// a healthy scenario levels off near 0 B/op.
//
//   node --expose-gc samples/javascript/leak-soak.js --scenario select,prepared -n 200000
//
// Uses the same connection string as the tests (test/env/test-env.js).

const { TestEnv } = require('../../test/env/test-env')
const { execFileSync } = require('child_process')
const fs = require('fs')
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

const procName = 'leak_soak_proc'

// op(target, i, state) runs once per iteration; optional setup/teardown run once around it.
// scale shrinks -n for slow scenarios, fresh means no shared connection, pool passes a pool.
const scenarios = {
  select: {
    describe: 'plain query, SELECT 1',
    op: conn => query(conn, 'select 1 as v')
  },
  param: {
    describe: 'query with a bound parameter',
    op: (conn, i) => query(conn, 'select ? as v', [i])
  },
  error: {
    describe: 'query that fails with a server error',
    op: conn => query(conn, 'select 1/0 as v').then(() => { throw new Error('expected an error') }, () => {})
  },
  multi: {
    describe: 'query returning several result sets and row counts',
    op: conn => query(conn, 'select 1 as a; select 2 as b; declare @t table (x int); insert into @t values (1), (2)')
  },
  prepared: {
    describe: 'one prepared statement executed repeatedly',
    setup: async conn => ({ ps: await prepare(conn, 'select ? as v') }),
    op: (conn, i, state) => preparedQuery(state.ps, [i]),
    teardown: (conn, state) => free(state.ps)
  },
  preparedPlain: {
    describe: 'one prepared statement with no parameters executed repeatedly',
    setup: async conn => ({ ps: await prepare(conn, 'select 1 as v') }),
    op: (conn, i, state) => preparedQuery(state.ps, []),
    teardown: (conn, state) => free(state.ps)
  },
  prepareFree: {
    describe: 'prepare, execute once, free',
    op: async (conn, i) => {
      const ps = await prepare(conn, 'select ? as v')
      await preparedQuery(ps, [i])
      await free(ps)
    }
  },
  proc: {
    describe: 'stored procedure with an output parameter',
    setup: async conn => {
      await query(conn, `if object_id('${procName}', 'P') is not null drop procedure ${procName}`)
      await query(conn, `create procedure ${procName} @a int, @b int output as begin set @b = @a + 1; select @a as a end`)
      return {}
    },
    op: (conn, i) => callproc(conn, procName, [i]),
    teardown: conn => query(conn, `drop procedure ${procName}`)
  },
  stream: {
    describe: 'streamed rows with pause and resume',
    op: conn => stream(conn, 'select top 20 name from sys.objects')
  },
  cancel: {
    describe: 'query cancelled straight after submit',
    scale: 0.05,
    op: conn => cancel(conn, "waitfor delay '00:00:02'")
  },
  transaction: {
    describe: 'begin, query, commit',
    op: async conn => {
      await promisify(cb => conn.beginTransaction(cb))
      await query(conn, 'select 1 as v')
      await promisify(cb => conn.commit(cb))
    }
  },
  reopen: {
    describe: 'open, query, close a new connection each time',
    scale: 0.02,
    fresh: true,
    op: async () => {
      const c = await open()
      await query(c, 'select 1 as v')
      await close(c)
    }
  },
  pool: {
    describe: 'query through a pool of 4',
    pool: true,
    op: pool => pool.promises.query('select 1 as v')
  }
}

if (hasFlag('--help')) {
  console.log(`
Usage: node --expose-gc samples/javascript/leak-soak.js [options]

Runs each scenario on one long-lived connection and reports native memory growth per
operation. A scenario whose growth stays above the threshold is flagged as a leak.

Options:
  --scenario <a,b>     Scenarios to run, comma separated, or "all" (default all)
  -n <count>           Operations per scenario (default 100000; cancel and reopen run fewer)
  --checkpoints <N>    Memory samples after warm-up (default 8)
  --threshold <B>      Bytes per op counted as a leak (default 8)
  --samples            Print every memory sample, to see the shape of the growth

Scenarios:
${Object.entries(scenarios).map(([k, v]) => `  ${k.padEnd(12)} ${v.describe}`).join('\n')}
`)
  process.exit(0)
}

const selected = flag('--scenario', 'all')
const names = selected === 'all' ? Object.keys(scenarios) : selected.split(',')
const total = parseInt(flag('-n', '100000'), 10)
const checkpoints = parseInt(flag('--checkpoints', '8'), 10)
const threshold = parseFloat(flag('--threshold', '8'))
const showSamples = hasFlag('--samples')

for (const name of names) {
  if (!scenarios[name]) {
    console.error(`unknown scenario ${name} - see --help`)
    process.exit(1)
  }
}

if (!global.gc) {
  console.error('run with node --expose-gc so memory is sampled after a full GC')
  process.exit(1)
}

// ── callback api as promises ────────────────────────────────────────

function promisify (fn) {
  return new Promise((resolve, reject) => fn((err, res) => err ? reject(err) : resolve(res)))
}

const open = () => promisify(cb => sql.open(connectionString, cb))
const close = c => promisify(cb => c.close(cb))
const query = (c, s, p) => promisify(cb => p ? c.query(s, p, cb) : c.query(s, cb))
const prepare = (c, s) => promisify(cb => c.prepare(s, cb))
const preparedQuery = (ps, p) => promisify(cb => ps.preparedQuery(p, cb))
const free = ps => promisify(cb => ps.free(cb))

// the callback runs once per result as (err, rows, outputParams, more); the last has more === false
function callproc (c, name, params) {
  return new Promise((resolve, reject) => {
    c.callproc(name, params, (err, rows, outputParams, more) => {
      if (err) reject(err)
      else if (!more) resolve()
    })
  })
}

// pause on every row and resume on the next tick; settles on 'free', the last event
function stream (c, s) {
  return new Promise((resolve, reject) => {
    const q = c.query(s)
    q.on('row', () => {
      q.pauseQuery()
      setImmediate(() => q.resumeQuery())
    })
    q.on('error', reject)
    q.on('free', resolve)
  })
}

// the query may finish with 'Operation canceled' or, if cancelled before submit, not at all
function cancel (c, s) {
  return new Promise(resolve => {
    const q = c.query(s, () => {})
    q.on('free', resolve)
    q.cancelQuery(() => {})
  })
}

// ── memory sampling ─────────────────────────────────────────────────

// private bytes where the platform gives it, else resident set; heapUsed is reported
// separately so JS growth and native growth can be told apart
function nativeBytes () {
  if (process.platform === 'win32') {
    return Number(execFileSync('powershell.exe',
      ['-NoProfile', '-Command', `(Get-Process -Id ${process.pid}).PrivateMemorySize64`]).toString().trim())
  }
  if (process.platform === 'linux') {
    const m = /^Private_Dirty:\s+(\d+) kB/m.exec(fs.readFileSync('/proc/self/smaps_rollup', 'utf8'))
    if (m) return Number(m[1]) * 1024
  }
  return process.memoryUsage().rss
}

async function sample () {
  global.gc()
  await new Promise(resolve => setTimeout(resolve, 100))
  global.gc()
  return { native: nativeBytes(), heap: process.memoryUsage().heapUsed }
}

// least squares slope of bytes against operations
function slope (points, key) {
  const n = points.length
  const mx = points.reduce((a, p) => a + p.ops, 0) / n
  const my = points.reduce((a, p) => a + p[key], 0) / n
  const num = points.reduce((a, p) => a + (p.ops - mx) * (p[key] - my), 0)
  const den = points.reduce((a, p) => a + (p.ops - mx) ** 2, 0)
  return den === 0 ? 0 : num / den
}

const mb = b => (b / 1048576).toFixed(1)

// ── run ─────────────────────────────────────────────────────────────

async function runScenario (name) {
  const s = scenarios[name]
  const ops = Math.max(100, Math.round(total * (s.scale || 1)))
  // the first fifth warms up allocator pools and the map's bucket array, then is discarded
  const warmup = Math.round(ops / 5)
  const step = Math.max(1, Math.floor((ops - warmup) / checkpoints))

  let target
  if (s.pool) {
    target = new sql.Pool({ connectionString, ceiling: 4 })
    await target.promises.open()
  } else if (!s.fresh) {
    target = await open()
  }
  const state = s.setup ? await s.setup(target) : undefined

  const points = []
  const started = Date.now()
  for (let i = 1; i <= ops; i++) {
    await s.op(target, i, state)
    if (i === warmup || (i > warmup && (i - warmup) % step === 0)) {
      const m = await sample()
      points.push({ ops: i, ...m })
      if (process.stdout.isTTY) process.stdout.write(`\r  ${name}: ${i}/${ops} native ${mb(m.native)} MB heap ${mb(m.heap)} MB   `)
      if (showSamples) console.log(`    ${name} ${String(i).padStart(8)} native ${mb(m.native)} MB heap ${mb(m.heap)} MB`)
    }
  }

  if (s.teardown) await s.teardown(target, state)
  if (s.pool) await target.promises.close()
  else if (target) await close(target)

  const native = slope(points, 'native')
  const heap = slope(points, 'heap')
  const secs = (Date.now() - started) / 1000
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(80) + '\r')
  return { name, ops, secs, native, heap, leak: native > threshold || heap > threshold }
}

async function run () {
  console.log(`leak soak: ${names.join(', ')} - ${total} ops, threshold ${threshold} B/op, node ${process.version} ${process.platform}`)
  const results = []
  for (const name of names) {
    const r = await runScenario(name)
    results.push(r)
    console.log(`  ${r.leak ? 'LEAK' : 'ok  '} ${name.padEnd(12)} native ${r.native.toFixed(1).padStart(7)} B/op  heap ${r.heap.toFixed(1).padStart(7)} B/op  (${r.ops} ops, ${r.secs.toFixed(0)}s)`)
  }
  const leaks = results.filter(r => r.leak)
  console.log(leaks.length ? `\n${leaks.length} scenario(s) grew above ${threshold} B/op: ${leaks.map(r => r.name).join(', ')}` : '\nno scenario grew above the threshold')
  process.exitCode = leaks.length ? 1 : 0
}

run().catch(e => {
  console.error(e)
  process.exit(2)
})
