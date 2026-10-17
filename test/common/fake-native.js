'use strict'

// a fake native Connection, for testing the JS layer (queue, reader, notifier) without a
// server. it replays a log recorded from the real driver (test/contract/native-tap.js):
// when JS makes a call, the fake matches it to the recorded call, and gives back what the
// driver gave back then.
//
// results are released in causal order: a recorded result is delivered only once JS has
// made every call recorded before it, one result per tick. so a query whose recorded result
// is HY008 waits until JS has actually sent the cancel - no timestamps needed.
//
// it also checks, whatever the log says, that JS respects the driver:
//   overlap        a second call (cancel apart) while one is still in flight on the connection
//   after release  a call on a statement that has been released
//   after close    a call once the connection is closed
//   diverged       a call that is not the next one recorded for that query
//   unrecorded     a call the log has nothing for (it is never answered)
//   stalled        nothing can move: JS waits on a result that waits on a call JS never makes

const path = require('path')
const { decode } = require('../contract/native-tap')

const STALL_MS = 1000

class ReplayNative {
  constructor (log, { stallMs = STALL_MS } = {}) {
    this.log = log
    this.stallMs = stallMs
    this.consumed = new Set() // recorded call ids JS has made
    this.callbacks = new Map() // recorded call id -> JS callback
    this.stateCallbacks = new Map() // recorded call id -> JS stateChangeCallback
    this.cursor = 0
    this.delivering = false
    this.inFlight = new Map() // recorded call id -> name, main calls only (not cancel)
    this.released = new Set() // statementIds
    this.closed = false
    this.violations = []
    this.stallTimer = null
  }

  violation (kind, detail) {
    this.violations.push(`${kind}: ${detail}`)
  }

  // the recorded calls JS has not made
  unconsumed () {
    return this.log.filter(e => e.ev === 'call' && !this.consumed.has(e.id)).map(e => `${e.name}(${JSON.stringify(e.args[0])})`)
  }

  match (name, args) {
    const qid = typeof args[0] === 'number' ? args[0] : null
    const sameQuery = e => e.ev === 'call' && !this.consumed.has(e.id) &&
      (qid === null || e.args[0] === qid)
    // a cancel runs alongside the statement's other calls, so it is matched on its own
    const channel = e => (e.name === 'cancelQuery') === (name === 'cancelQuery')
    const next = this.log.find(e => sameQuery(e) && channel(e))
    if (next && next.name === name) return next
    const later = this.log.find(e => sameQuery(e) && e.name === name)
    if (later) {
      this.violation('diverged', `${name}(${qid}) made where the log has ${next?.name ?? 'nothing'} next`)
      return later
    }
    this.violation('unrecorded', `${name}(${qid ?? ''})`)
    return null
  }

  invoke (name, args) {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
    const callArgs = cb ? args.slice(0, -1) : args
    if (this.closed) this.violation('after close', name)
    const handle = callArgs[1]
    if (handle && typeof handle.statementId === 'number' && this.released.has(handle.statementId)) {
      this.violation('after release', `${name} on statement ${handle.statementId}`)
    }
    if (name !== 'cancelQuery' && this.inFlight.size > 0) {
      this.violation('overlap', `${name} while ${[...this.inFlight.values()].join(', ')} in flight`)
    }
    const entry = this.match(name, callArgs)
    if (!entry) return
    this.consumed.add(entry.id)
    if (cb) this.callbacks.set(entry.id, { name, cb })
    if (name !== 'cancelQuery' && cb) this.inFlight.set(entry.id, name)
    const queryObj = callArgs[1]
    if (queryObj && typeof queryObj.stateChangeCallback === 'function') {
      this.stateCallbacks.set(entry.id, queryObj.stateChangeCallback)
    }
    if (name === 'releaseStatement' && handle) this.released.add(handle.statementId)
    if (name === 'close') this.closed = true
    this.pump()
  }

  // deliver recorded states and results, in recorded order, until a recorded call JS has
  // not made yet
  pump () {
    this.armStall()
    if (this.delivering) return
    while (this.cursor < this.log.length) {
      const e = this.log[this.cursor]
      if (e.ev === 'call') {
        if (!this.consumed.has(e.id)) return
        this.cursor++
        continue
      }
      this.delivering = true
      setImmediate(() => {
        this.delivering = false
        this.cursor++
        this.deliver(e)
        this.pump()
      })
      return
    }
  }

  deliver (e) {
    if (e.ev === 'state') {
      const onState = this.stateCallbacks.get(e.of)
      if (onState) onState(null, decode(e.change))
      return
    }
    const call = this.callbacks.get(e.of)
    this.inFlight.delete(e.of)
    if (call) call.cb(...decode(e.result))
  }

  // a result JS is waiting for is held back by a call JS is not going to make
  armStall () {
    clearTimeout(this.stallTimer)
    this.stallTimer = setTimeout(() => {
      const waiting = [...this.inFlight.values()]
      const blocked = this.log[this.cursor]
      if (waiting.length > 0 && blocked) {
        this.violation('stalled', `JS waits on ${waiting.join(', ')}; the log waits on ${blocked.name ?? blocked.ev}(${JSON.stringify(blocked.args?.[0] ?? '')})`)
      }
    }, this.stallMs)
    this.stallTimer.unref()
  }

  // the native Connection interface
  open (...a) { this.invoke('open', a) }
  close (...a) { this.invoke('close', a) }
  query (...a) { this.invoke('query', a) }
  bindQuery (...a) { this.invoke('bindQuery', a) }
  prepare (...a) { this.invoke('prepare', a) }
  fetchRows (...a) { this.invoke('fetchRows', a) }
  nextResultSet (...a) { this.invoke('nextResultSet', a) }
  releaseStatement (...a) { this.invoke('releaseStatement', a) }
  cancelQuery (...a) { this.invoke('cancelQuery', a) }
  callProcedure (...a) { this.invoke('callProcedure', a) }
  unbind (...a) { this.invoke('unbind', a) }
  beginTransaction (...a) { this.invoke('beginTransaction', a) }
  commit (...a) { this.invoke('commit', a) }
  rollback (...a) { this.invoke('rollback', a) }
}

// an msnodesqlv8-shaped module whose connections run over the given fake native
// connection, through the real JS layer (ConnectionWrapper, DriverMgr, reader, queue)
function fakeSql (native, { version = 18 } = {}) {
  const root = path.join(__dirname, '../..')
  const { ConnectionWrapper } = require(path.join(root, 'lib/connection'))
  const { driverModule } = require(path.join(root, 'lib/driver'))
  const defaultCallback = err => { if (err) throw new Error(err) }

  const open = (connectionString, cb) => {
    const driverMgr = new driverModule.DriverMgr(native, version)
    const conn = new ConnectionWrapper({}, {}, driverMgr, defaultCallback, 0)
    conn.setUseUTC(true)
    conn.setDriverVersion(version)
    native.open(connectionString, 0, err => setImmediate(() => cb(Array.isArray(err) ? err[0] : err, conn)))
  }
  return {
    open,
    promises: {
      open: connectionString => new Promise((resolve, reject) => open(connectionString, (e, c) => e ? reject(e) : resolve(c)))
    }
  }
}

module.exports = { ReplayNative, fakeSql }
