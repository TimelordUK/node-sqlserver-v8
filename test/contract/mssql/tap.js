'use strict'

// records how node-mssql (tediousjs/node-mssql) drives msnodesqlv8, while node-mssql's own
// msnodesqlv8 suite runs. load it into their mocha run:
//
//   MSNODESQLV8_TAP_OUT=<file.jsonl> npx mocha --exit -t 30000 \
//     --require <this repo>/test/contract/mssql/tap.js test/msnodesqlv8
//
// it wraps the connection methods node-mssql calls and writes one JSON line per call:
//   { test, conn, seq, method, sql, options, params, transcript }
// where the transcript is in the corpus's line format (see ../recorder.js): every event the
// query emitted, every callback, and what node-mssql did to it and when - 'action pause',
// 'action resume', 'action cancel', 'cancel-cb ...'. an event that node-mssql emits on our
// query object itself (it emits 'done' to work around older versions) is logged as
// 'mssql-emit <event>'.
//
// the result is an inventory of the API surface node-mssql uses and the sequences it
// depends on; mssql/generate.js turns it into corpus scripts that need no node-mssql.

const fs = require('fs')
const path = require('path')

const OUT = process.env.MSNODESQLV8_TAP_OUT
if (!OUT) throw new Error('set MSNODESQLV8_TAP_OUT to the file to write')
// the msnodesqlv8 that node-mssql loads, i.e. its node_modules/msnodesqlv8 (a link to this repo)
const root = path.dirname(require.resolve('msnodesqlv8/package.json', { paths: [process.cwd()] }))
const { ConnectionWrapper } = require(path.join(root, 'lib/connection'))

const strip = m => String(m ?? '').replace(/^(\[[^\]]*\])+/, '').replace(/\s+/g, ' ').trim()
const describeError = e => e ? `${e.sqlstate ?? '-'} ${e.code ?? '-'} ${strip(e.message)}` : 'null'
const formatValue = v => {
  if (v === null || v === undefined) return String(v)
  if (Buffer.isBuffer(v)) return v.length > 32 ? `0x${v.subarray(0, 32).toString('hex')}...(${v.length} bytes)` : `0x${v.toString('hex')}`
  if (v instanceof Date) return v.toISOString()
  const s = JSON.stringify(v)
  return s && s.length > 80 ? `${s.slice(0, 80)}...(${s.length})` : s
}

// parameters as JSON: msnodesqlv8 parameter objects are plain data, plus Buffers, Dates and
// numbers JSON can't hold
function serialise (v) {
  return JSON.parse(JSON.stringify(v ?? null, (k, x) => {
    if (x && x.type === 'Buffer' && Array.isArray(x.data)) return { $buffer: Buffer.from(x.data).toString('hex') }
    if (typeof x === 'number' && !Number.isFinite(x)) return { $number: String(x) }
    if (typeof x === 'bigint') return { $bigint: String(x) }
    return x
  }, 0))
}

let currentTest = '(outside a test)'
let seq = 0
const connIds = new WeakMap()
let nextConn = 0
const connId = c => {
  if (!connIds.has(c)) connIds.set(c, nextConn++)
  return connIds.get(c)
}
const records = []

// which file called: an event emitted from node-mssql's code is theirs, not ours
const fromMssql = () => {
  const stack = new Error().stack.split('\n').slice(3)
  const first = stack.find(l => !l.includes('node:events') && !l.includes(__filename))
  return !!first && /[\\/]node-mssql[\\/]lib[\\/]/.test(first) && !/[\\/]node_modules[\\/]/.test(first)
}

function record (conn, method, sql, options, params) {
  const r = { test: currentTest, conn: connId(conn), seq: seq++, method, sql, options, params: serialise(params), transcript: [] }
  records.push(r)
  return r
}

// the line, collapsing consecutive identical lines as the corpus does
function push (r, line) {
  const t = r.transcript
  const last = t[t.length - 1]
  const m = last && /^(.*) x(\d+)$/.exec(last)
  if (last === line) t[t.length - 1] = `${line} x2`
  else if (m && m[1] === line) t[t.length - 1] = `${line} x${Number(m[2]) + 1}`
  else if (t.length < 2000) t.push(line)
}

function wrapCallback (r, cb, label = 'cb') {
  if (typeof cb !== 'function') return cb
  return function (err, rows, more) {
    if (err && !(Array.isArray(err) && err.length === 0)) push(r, `${label} error ${describeError(Array.isArray(err) ? err[0] : err)} more=${more}`)
    else push(r, `${label} ok rows=${Array.isArray(rows) ? rows.length : rows == null ? 'null' : typeof rows} more=${more}`)
    return cb.apply(this, arguments)
  }
}

// log the query's events, and what is done to it
// column values are logged for the first rows of each result set only (and any chunked
// value, more=true), so that a long stream collapses to 'row xN'
const COLUMN_ROWS = 3

function watch (r, q) {
  if (!q || typeof q.emit !== 'function') return q
  const emit = q.emit
  let rowsInSet = 0
  q.emit = function (ev, ...args) {
    const who = fromMssql() ? 'mssql-emit ' : ''
    switch (ev) {
      case 'meta': rowsInSet = 0; push(r, `${who}meta ${args[0].map(c => c.name).join(',')}`); break
      case 'row': rowsInSet++; push(r, `${who}row`); break
      case 'column':
        if (rowsInSet <= COLUMN_ROWS || args[2]) push(r, `${who}column ${args[0]} ${formatValue(args[1])}${args[2] ? ' more=true' : ''}`)
        break
      case 'rowcount': push(r, `${who}rowcount ${args[0]}`); break
      case 'info': push(r, `${who}info ${describeError(args[0])}`); break
      case 'error': push(r, `${who}error ${describeError(args[0])} more=${args[1]}`); break
      case 'output': push(r, `${who}output`); break
      case 'submitted': case 'done': case 'free': push(r, `${who}${ev}`); break
      default: break // stateChange, debug ...
    }
    return emit.call(this, ev, ...args)
  }
  for (const name of ['pauseQuery', 'resumeQuery']) {
    const f = q[name]
    if (typeof f !== 'function') continue
    q[name] = function (...args) {
      push(r, `action ${name === 'pauseQuery' ? 'pause' : 'resume'}`)
      return f.apply(this, args)
    }
  }
  const cancel = q.cancelQuery
  if (typeof cancel === 'function') {
    q.cancelQuery = function (cb, ...rest) {
      push(r, 'action cancel')
      return cancel.call(this, err => {
        push(r, err ? `cancel-cb error ${strip(err.message)}` : 'cancel-cb ok')
        if (cb) cb(err)
      }, ...rest)
    }
  }
  return q
}

const P = ConnectionWrapper.prototype

// queryRaw / query (queryOrObj, [params], [cb])
for (const method of ['queryRaw', 'query']) {
  const f = P[method]
  P[method] = function (queryOrObj, paramsOrCb, cb) {
    const sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj?.query_str
    const options = typeof queryOrObj === 'object' && queryOrObj ? Object.fromEntries(Object.entries(queryOrObj).filter(([k]) => k !== 'query_str')) : undefined
    const params = Array.isArray(paramsOrCb) ? paramsOrCb : undefined
    const r = record(this, method, sql, options, params)
    if (typeof paramsOrCb === 'function') paramsOrCb = wrapCallback(r, paramsOrCb)
    else cb = wrapCallback(r, cb)
    return watch(r, f.call(this, queryOrObj, paramsOrCb, cb))
  }
}

// prepare: the statement's executions share one query object
const prepare = P.prepare
P.prepare = function (queryOrObj, cb) {
  const sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj?.query_str
  const r = record(this, 'prepare', sql)
  return prepare.call(this, queryOrObj, (err, ps) => {
    push(r, err ? `prepare-cb error ${describeError(err)}` : 'prepare-cb ok')
    if (ps && typeof ps.preparedQuery === 'function') {
      const pq = ps.preparedQuery
      ps.preparedQuery = function (params, qcb) {
        const er = record(this, 'preparedQuery', sql, undefined, params)
        return watch(er, pq.call(this, params, wrapCallback(er, qcb)))
      }
    }
    cb(err, ps)
  })
}

// calls with only a callback
for (const method of ['beginTransaction', 'commit', 'rollback']) {
  const f = P[method]
  P[method] = function (cb) {
    const r = record(this, method)
    return f.call(this, wrapCallback(r, cb))
  }
}

const close = P.close
P.close = function (immediately, cb) {
  const r = record(this, 'close')
  if (typeof immediately === 'function') return close.call(this, wrapCallback(r, immediately))
  return close.call(this, immediately, wrapCallback(r, cb))
}

const setUseUTC = P.setUseUTC
P.setUseUTC = function (utc) {
  record(this, 'setUseUTC', undefined, { utc })
  return setUseUTC.call(this, utc)
}

// bulk: tableMgr().bind(table, cb(mgr)) then mgr.insertRows(rows, cb)
const tableMgr = P.tableMgr
P.tableMgr = function () {
  const conn = this
  const tm = tableMgr.call(this)
  const bind = tm.bind
  tm.bind = function (table, cb) {
    const r = record(conn, 'tableMgr.bind', table)
    return bind.call(this, table, (mgr, err) => {
      push(r, err ? `bind-cb error ${describeError(err)}` : `bind-cb ok columns=${mgr?.getMeta?.()?.getAllColumns?.().length ?? '?'}`)
      if (mgr && typeof mgr.insertRows === 'function') {
        const insertRows = mgr.insertRows
        mgr.insertRows = function (rows, icb) {
          const ir = record(conn, 'insertRows', table, undefined, rows)
          return insertRows.call(this, rows, wrapCallback(ir, icb))
        }
      }
      cb(mgr, err)
    })
  }
  return tm
}

// the test each call belongs to
exports.mochaHooks = {
  beforeEach () {
    currentTest = this.currentTest.fullTitle()
  },
  afterEach () {
    currentTest = `(after) ${this.currentTest.fullTitle()}`
  }
}

// late events (after a test ends) still land in their record, so write at exit
process.on('exit', () => {
  fs.writeFileSync(OUT, records.map(r => JSON.stringify(r)).join('\n') + '\n')
})
