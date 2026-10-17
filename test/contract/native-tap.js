'use strict'

// records what passes between the JS layer and the native driver: every call JS makes into
// a native Connection, every state change the statement reports, and every callback, in
// the order they happened. test/common/fake-native.js replays such a log in place of the
// driver, so a scenario's event stream can be reproduced without a server.
//
// log entries (t: ms since the tap was installed):
//   { ev: 'call', id, t, name, args }   JS called native.<name>(...args, callback)
//   { ev: 'state', of, t, change }      a statement state change, through the stateChangeCallback
//                                       passed to call <of>
//   { ev: 'return', of, t, result }     the callback of call <of> ran with ...result
//
// values are encoded so they survive JSON (errors keep their message, dates and buffers
// their value). unless keepData is set, the rows of a fetch are reduced to a count and the
// first row - enough for every transcript that does not print column values.

const WRAPPED = Symbol('native-tap')

function encode (v) {
  if (v === undefined) return { $: 'undefined' }
  if (typeof v === 'function') return { $: 'function' }
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'bigint') return { $: 'bigint', v: v.toString() }
    return v
  }
  if (v instanceof Error) {
    const o = { $: 'error', message: v.message }
    for (const k of Object.keys(v)) o[k] = encode(v[k])
    // the server's host name is no business of the log, and differs from machine to machine
    if (o.serverName) o.serverName = '<server>'
    return o
  }
  if (v instanceof Date) {
    const o = { $: 'date', v: v.getTime() }
    if (v.nanosecondsDelta !== undefined) o.ns = v.nanosecondsDelta
    return o
  }
  if (Buffer.isBuffer(v)) return { $: 'buffer', v: v.toString('hex') }
  if (Array.isArray(v)) return v.map(encode)
  const o = {}
  for (const k of Object.keys(v)) o[k] = encode(v[k])
  return o
}

function decode (v) {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(decode)
  switch (v.$) {
    case 'undefined': return undefined
    case 'function': return () => {}
    case 'bigint': return BigInt(v.v)
    case 'buffer': return Buffer.from(v.v, 'hex')
    case 'date': {
      const d = new Date(v.v)
      if (v.ns !== undefined) d.nanosecondsDelta = v.ns
      return d
    }
    case 'rows': return Array.from({ length: v.n }, () => decode(v.first))
    case 'error': {
      const e = new Error(v.message)
      for (const k of Object.keys(v)) {
        if (k !== '$' && k !== 'message') e[k] = decode(v[k])
      }
      return e
    }
  }
  const o = {}
  for (const k of Object.keys(v)) o[k] = decode(v[k])
  return o
}

// the rows of a fetch result, reduced to a count and the first row
function compactRows (result) {
  for (const r of result) {
    if (r && Array.isArray(r.data) && r.data.length > 0) {
      r.data = { $: 'rows', n: r.data.length, first: r.data[0] }
    }
  }
  return result
}

// replace nativeModule.Connection, so every connection made from now on is recorded
function install (nativeModule, { keepData = false } = {}) {
  const Real = nativeModule.Connection
  const log = []
  const t0 = performance.now()
  const now = () => Math.round((performance.now() - t0) * 10) / 10
  nativeModule.Connection = function () {
    const real = new Real()
    return new Proxy(real, {
      get (target, name) {
        const f = target[name]
        if (typeof f !== 'function' || name === 'constructor') return f
        return (...args) => {
          const id = log.length
          const cb = args[args.length - 1]
          const hasCb = typeof cb === 'function'
          const callArgs = hasCb ? args.slice(0, -1) : args
          // never record a connection string: the log is committed, and it carries credentials
          const recorded = name === 'open' ? ['<connection string>', ...callArgs.slice(1)] : callArgs
          log.push({ ev: 'call', id, t: now(), name, args: encode(recorded) })
          const queryObj = args[1]
          if (queryObj && typeof queryObj.stateChangeCallback === 'function' && !queryObj.stateChangeCallback[WRAPPED]) {
            const onState = queryObj.stateChangeCallback
            queryObj.stateChangeCallback = (e, change) => {
              log.push({ ev: 'state', of: id, t: now(), change: encode(change) })
              onState(e, change)
            }
            queryObj.stateChangeCallback[WRAPPED] = true
          }
          if (hasCb) {
            args[args.length - 1] = (...result) => {
              const enc = encode(result)
              log.push({ ev: 'return', of: id, t: now(), result: name === 'fetchRows' && !keepData ? compactRows(enc) : enc })
              cb(...result)
            }
          }
          return f.apply(target, args)
        }
      }
    })
  }
  return { log, restore: () => { nativeModule.Connection = Real } }
}

module.exports = { install, encode, decode }
