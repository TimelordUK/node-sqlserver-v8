'use strict'

// runs a scenario from scenarios.js and records everything the query does as a
// transcript: one line per event, callback, cancel callback and action, in the order
// they happen. the transcript is compared with the one the corpus expects, so the
// exact sequence of events is part of the contract, not just the results.
//
// line format (the main query is unprefixed, other queries are prefixed 'q2: ' etc.)
//   submitted
//   meta a,b                       column names
//   column 0 "abc"                 only for scenarios with columns: true
//   row x51                       consecutive identical lines are collapsed: 'free x2'
//   rowcount 1
//   info 01000 3621 <message>      sqlstate, code, message without the [driver] prefix
//   error 23000 2627 <message> more=false
//   output                         procedure output parameters
//   done
//   free
//   cb ok rows=1 more=false        the query callback
//   cb error 42000 50000 <message> more=false
//   action pause|resume|cancel     something the scenario did, at that point
//   cancel-cb ok|error <message>
//   TIMEOUT ...                    the query never freed, or the connection hung
//   check ok|error ...|TIMEOUT     a query run on the connection after the scenario

const { execFile } = require('child_process')
const path = require('path')

const MAX_LINES = 400
const MAX_EVENTS = 2000 // beyond this the query is looping; stop so the transcript is stable
const SETTLE_MS = 150
const PROCESS_TIMEOUT_MS = 30000

const strip = m => String(m ?? '').replace(/^(\[[^\]]*\])+/, '').replace(/\s+/g, ' ').trim()

const describeError = e => {
  if (!e) return 'null'
  const state = e.sqlstate ?? '-'
  const code = e.code ?? '-'
  return `${state} ${code} ${strip(e.message)}`
}

const formatValue = v => {
  if (v === null || v === undefined) return String(v)
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`
  if (v instanceof Date) return v.toISOString()
  return JSON.stringify(v)
}

class Transcript {
  constructor () {
    this.lines = []
    this.counts = []
    this.total = 0
  }

  push (line) {
    // rows are bounded by the query itself; only other events count towards a runaway
    if (!line.endsWith('row') && ++this.total > MAX_EVENTS) return
    const last = this.lines.length - 1
    if (last >= 0 && this.lines[last] === line) {
      this.counts[last]++
      return
    }
    if (this.lines.length >= MAX_LINES) return
    this.lines.push(line)
    this.counts.push(1)
  }

  toLines () {
    const out = this.lines.map((l, i) => this.counts[i] > 1 ? `${l} x${this.counts[i]}` : l)
    if (this.total > MAX_EVENTS) {
      // how far a loop gets before the cap varies run to run, so leave the count off
      out[out.length - 1] = `${this.lines[this.lines.length - 1]} (repeating)`
      out.push(`RUNAWAY more than ${MAX_EVENTS} events`)
    }
    else if (this.lines.length >= MAX_LINES) out.push(`... truncated after ${MAX_LINES} distinct lines`)
    return out
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function withTimeout (promise, ms) {
  let h
  return Promise.race([
    promise.then(v => { clearTimeout(h); return { ok: true, value: v } }, e => { clearTimeout(h); return { ok: false, error: e } }),
    new Promise(resolve => { h = setTimeout(() => resolve({ timeout: true }), ms) })
  ])
}

class Run {
  constructor (sql, conn, scenario, transcript) {
    this.sql = sql
    this.conn = conn
    this.scenario = scenario
    this.t = transcript
    this.pending = new Map()
    this.queries = new Map()
  }

  log (label, line) {
    this.t.push(label === 'q1' ? line : `${label}: ${line}`)
  }

  start (label, def) {
    const log = line => this.log(label, line)
    let resolveFree
    this.pending.set(label, new Promise(resolve => { resolveFree = resolve }))
    const args = [def.sql]
    if (def.params) args.push(def.params)
    if (def.callback) {
      args.push((err, rows, more) => {
        if (err) log(`cb error ${describeError(err)} more=${more}`)
        else log(`cb ok rows=${rows ? rows.length : 'null'} more=${more}`)
      })
    }
    const q = this.conn.query(...args)
    this.queries.set(label, q)
    const at = def.at ?? {}
    let rows = 0
    q.on('submitted', () => log('submitted'))
    q.on('meta', m => log(`meta ${m.map(c => c.name).join(',')}`))
    q.on('row', () => {
      log('row')
      const actions = at.row?.[++rows]
      if (actions) this.act(label, q, actions)
    })
    if (def.columns) {
      q.on('column', (index, value, more) => log(`column ${index} ${formatValue(value)}${more ? ' more=true' : ''}`))
    }
    q.on('rowcount', n => log(`rowcount ${n}`))
    q.on('info', m => log(`info ${describeError(m)}`))
    q.on('error', (e, more) => log(`error ${describeError(e)} more=${more}`))
    q.on('output', () => log('output'))
    q.on('done', () => log('done'))
    q.on('free', () => { log('free'); resolveFree() })
    q.once('free', () => {
      if (label === 'q1') this.startFollowUps('free')
      // actions on a query that has already freed, e.g. a late cancel
      if (at.free) setTimeout(() => this.act(label, q, at.free), 20)
    })
    if (at.start) this.act(label, q, at.start)
    for (const [ms, actions] of Object.entries(at.later ?? {})) {
      setTimeout(() => this.act(label, q, actions), Number(ms))
    }
    return q
  }

  act (label, q, actions) {
    for (const action of actions) {
      const [name, arg] = action.split(':')
      if (name === 'pause') {
        this.log(label, 'action pause')
        q.pauseQuery()
      } else if (name === 'resume') {
        const resume = () => { this.log(label, 'action resume'); q.resumeQuery() }
        if (arg) setTimeout(resume, Number(arg))
        else resume()
      } else if (name === 'cancel') {
        this.log(label, 'action cancel')
        q.cancelQuery(e => this.log(label, e ? `cancel-cb error ${strip(e.message)}` : 'cancel-cb ok'))
      } else if (name === 'queue') {
        // start the follow-up queries now, while this query is still on the connection
        this.startFollowUps(arg)
      } else {
        throw new Error(`unknown action ${action}`)
      }
    }
  }

  startFollowUps (when) {
    for (const f of this.scenario.followUps ?? []) {
      if ((f.when ?? 'start') === when) this.start(f.label, f)
    }
  }

  async execute () {
    const s = this.scenario
    for (const statement of s.setup ?? []) {
      await this.conn.promises.query(statement)
    }
    this.start('q1', s)
    this.startFollowUps('start')

    const timeoutMs = s.timeoutMs ?? 6000
    const deadline = Date.now() + timeoutMs
    // follow-ups can be added while waiting, so wait until every known query has freed
    for (;;) {
      const labels = [...this.pending.keys()]
      const res = await withTimeout(Promise.all(labels.map(l => this.pending.get(l))), Math.max(1, deadline - Date.now()))
      if (res.timeout) {
        const stuck = []
        for (const l of labels) {
          if (!(await withTimeout(this.pending.get(l), 1)).ok) stuck.push(l)
        }
        this.t.push(`TIMEOUT no free from ${stuck.join(',')} after ${timeoutMs}ms`)
        return false
      }
      await delay(SETTLE_MS) // late events after free are part of the transcript
      if (this.pending.size === labels.length) return true
    }
  }

  async check () {
    const res = await withTimeout(this.conn.promises.query('select 1 as n'), 3000)
    if (res.timeout) this.t.push('check TIMEOUT')
    else if (!res.ok) this.t.push(`check error ${describeError(res.error)}`)
    else this.t.push(res.value.first?.[0]?.n === 1 ? 'check ok' : 'check wrong result')
  }
}

// returns the transcript of one run of the scenario as an array of lines
async function runScenario (sql, connectionString, scenario) {
  const t = new Transcript()
  const conn = await sql.promises.open(connectionString)
  const run = new Run(sql, conn, scenario, t)
  try {
    const freed = await run.execute()
    if (freed) await run.check()
  } catch (e) {
    t.push(`EXCEPTION ${strip(e.message)}`)
  }
  const closed = await withTimeout(conn.promises.close(), 3000)
  if (closed.timeout) t.push('close TIMEOUT')
  return t.toLines()
}

// runs the scenario in a child process (see run-one.js) and returns its transcript
// nativeFile: also record the native calls of the run there (see native-tap.js)
function runIsolated (root, connectionString, scenario, nativeFile) {
  return new Promise(resolve => {
    const env = { ...process.env, MSSQL_CONTRACT_CS: connectionString }
    if (nativeFile) env.MSSQL_CONTRACT_NATIVE = nativeFile
    execFile(process.execPath, [path.join(__dirname, 'run-one.js'), root, scenario.name], {
      env,
      timeout: PROCESS_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }, (err, stdout, stderr) => {
      try {
        resolve(JSON.parse(stdout))
      } catch {
        resolve([err?.killed ? `PROCESS TIMEOUT after ${PROCESS_TIMEOUT_MS}ms` : `PROCESS FAILED ${err?.code ?? ''} ${strip(stderr).slice(0, 200)}`])
      }
    })
  })
}

// runs the scenario several times: a contract has to be deterministic, so every
// distinct transcript is returned, most frequent first.
async function captureScenario (root, connectionString, scenario, repeat = 3) {
  const seen = new Map()
  for (let i = 0; i < repeat; i++) {
    const lines = await runIsolated(root, connectionString, scenario)
    const key = lines.join('\n')
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({ lines: text.split('\n'), count }))
}

module.exports = { runScenario, runIsolated, captureScenario }
