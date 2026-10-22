/**
 * Created by Stephen on 28/06/2017.
 */

'use strict'
const { logger } = require('./logger')

const notifyModule = ((() => {
  const { EventEmitter } = require('stream')
  class QueryObject {
    constructor (p, to, po) {
      this.query_str = p
      this.query_timeout = to || 0
      this.query_polling = po || false
      this.query_tz_adjustment = 0
    }
  }

  class LexicalParam {
    constructor (type, value, name) {
      this.type = type
      this.value = value
      this.name = name
    }
  }

  class ChunkyArgs {
    constructor (params, callback) {
      this.params = params
      this.callback = callback || null
    }
  }

  class StreamEventsPromises {
    constructor (se) {
      this.se = se
    }

    async cancel (timeout) {
      timeout = timeout || 5000
      const q = this.se
      let err
      return new Promise((resolve, reject) => {
        const h = setTimeout(() => {
          reject(new Error('failed to cancel'))
        }, timeout)
        try {
          q.on('free', () => {
            logger.debugLazy(() => `${q.getQueryId()} free event from cancel request`)
            err = err || new Error('Operation canceled')
            resolve(err)
            clearTimeout(h)
          })
          q.on('error', (e) => {
            err = e
            if (!e.message.includes('canceled')) {
              clearTimeout(h)
              reject(e)
            } else {
              err = e
            }
          })
          // no pause first: pausing parks the query, and a parked query that is still
          // executing was freed while the native statement was busy (connection then
          // reported 'busy with results for another command').
          setImmediate(() => {
            q.cancelQuery()
          })
        } catch (e) {
          reject(e)
        }
      })
    }
  }

  class StreamEvents extends EventEmitter {
    constructor () {
      super()
      this.queryId = 0
      this.theConnection = null
      this.queryObj = null
      this.queryWorker = null
      this.operation = null
      this.paused = null
      this.canelSent = false
      // a cancel sent whose own callback has not run yet, and what waits for it to run
      this.cancelPending = false
      this.afterCancelSteps = []
      this.prepared = null
      this.handle = null
      this.cancelToken = null
      this.promises = new StreamEventsPromises(this)
      this.stateChangeCallback = null
      this.lastStateChange = null
      this.timeoutHandle = null
    }

    isPaused () {
      return this.paused
    }

    setPrepared () {
      this.prepared = true
    }

    isPrepared () {
      return this.prepared
    }

    getLastStateChange () {
      return this.lastStateChange
    }

    getQueryObj () {
      return this.queryObj
    }

    getQueryId () {
      return this.queryId
    }

    setQueryId (qid) {
      this.queryId = qid
    }

    setOperation (id) {
      this.operation = id
    }

    getOperation () {
      return this.operation
    }

    setHandle (h) {
      this.handle = h
      if (this.cancelToken) {
        this.sendDeferredCancel()
      }
    }

    getHandle () {
      return this.handle
    }

    getCancelSent () {
      return this.canelSent
    }

    setQueryObj (qo) {
      this.queryObj = qo
    }

    setConn (c) {
      this.theConnection = c
    }

    setQueryWorker (qw) {
      this.queryWorker = qw
      if (this.paused) {
        logger.debugLazy(() => `${this.queryId} pausing the query worker.`)
        this.queryWorker.pause()
      }
    }

    // a cancel asked for before the statement had a handle, sent now that it has one
    sendDeferredCancel () {
      const { cb } = this.cancelToken
      this.cancelToken = null
      this.cancelQuery(cb)
    }

    // one cancel per query. a repeated cancel is refused in its own callback, a tick on, and
    // the query's events are untouched: the first cancel ends it (HY008, done, free)
    cancelQuery (cb) {
      if (this.canelSent || this.cancelToken) {
        logger.debugLazy(() => `${this.queryId} cancel already issued`)
        if (cb) {
          setImmediate(() => cb(new Error(`[msnodesql] cannot cancel query (cancel already requested) id ${this.queryId}`)))
        }
        return
      }
      if (this.theConnection) {
        if (this.handle) {
          logger.debugLazy(() => `${this.queryId} issue cancel request`)
          this.cancelToken = null
          this.canelSent = true
          this.cancelPending = true
          // the cancel's callback and the HY008 from the native call in flight complete on
          // different threads: the reader holds what that call brings back until this has run
          const settled = (e, res) => {
            try {
              if (cb) {
                cb(e, res)
              } else if (e) {
                this.theConnection.defaultCallback(e)
              }
            } finally {
              this.settleCancel()
            }
          }
          try {
            this.theConnection.cancelQuery(this, settled)
          } catch (e) {
            this.settleCancel()
            throw e
          }
        } else {
          logger.debugLazy(() => `${this.queryId} cancel request but no statement handle`)
          this.cancelToken = {
            cb
          }
        }
      } else {
        setImmediate(() => {
          cb(new Error('[msnodesql] cannot cancel query where setConn has not been set'))
        })
      }
    }

    // run a step now, or once the cancel in flight has called back
    whenCancelSettled (step) {
      if (this.cancelPending) {
        this.afterCancelSteps.push(step)
      } else {
        step()
      }
    }

    // a tick on, so that work the cancel's callback queued (e.g. the refusal of a second
    // cancel) still comes first
    settleCancel () {
      if (!this.cancelPending) return
      this.cancelPending = false
      const steps = this.afterCancelSteps
      this.afterCancelSteps = []
      if (steps.length > 0) {
        setImmediate(() => steps.forEach(step => step()))
      }
    }

    pauseQuery () {
      this.paused = true
      if (this.queryWorker) {
        this.queryWorker.pause()
      }
    }

    resumeQuery () {
      this.paused = false
      if (this.queryWorker) {
        this.queryWorker.resume()
      }
    }

    // Set up the state change callback for the C++ layer
    setStateChangeCallback () {
      if (!this.stateChangeCallback) {
        this.stateChangeCallback = (_, stateChange) => {
          try {
            logger.debugLazy(() => `${this.queryId} state change: ${JSON.stringify(stateChange, null, 2)})`)
            stateChange.queryId = this.queryId
            stateChange.timestamp = new Date()
            this.handle = stateChange.handle
            if (this.cancelToken) {
              logger.debugLazy(() => 'received handle with cancel token - invoke cancel request')
              this.sendDeferredCancel()
            }
            this.lastStateChange = stateChange
            this.emit('stateChange', stateChange)
          } catch (e) {
            logger.error(e.message, e)
          }
        }
      }
      return this.stateChangeCallback
    }

    setupTimeout (timeoutMs, onTimeout) {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
      }

      if (timeoutMs && timeoutMs > 0) {
        this.timeoutHandle = setTimeout(() => {
          logger.debugLazy(() => `Timeout ${timeoutMs}ms reached for query ${this.queryId} - triggering cancel`)
          onTimeout()
        }, timeoutMs)
      }
    }

    clearTimeout () {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }
    }
  }

  class NotifyFactory {
    constructor () {
      this.StreamEvents = StreamEvents
      this.LexicalParam = LexicalParam
      this.QueryObject = QueryObject
    }

    getChunkyArgs (paramsOrCallback, callback) {
      if ((typeof paramsOrCallback === 'object' &&
              Array.isArray(paramsOrCallback)) &&
          typeof callback === 'function') {
        return new ChunkyArgs(paramsOrCallback, callback)
      }

      if (!paramsOrCallback && typeof callback === 'function') {
        return new ChunkyArgs([], callback)
      }

      if (typeof paramsOrCallback === 'function' && callback === undefined) {
        return new ChunkyArgs([], paramsOrCallback)
      }

      if ((typeof paramsOrCallback === 'object' &&
              Array.isArray(paramsOrCallback)) &&
          callback === undefined) {
        return new ChunkyArgs(paramsOrCallback, null)
      }

      if ((!paramsOrCallback) &&
          callback === undefined) {
        return new ChunkyArgs([], null)
      }

      throw new Error('[msnodesql] Invalid parameter(s) passed to function query or queryRaw.')
    }

    getQueryObject (p) {
      return typeof (p) === 'string'
        ? new QueryObject(p)
        : p
    }

    validateParameters (parameters, funcName) {
      parameters.forEach(p => {
        if (typeof p.value !== p.type) {
          throw new Error(['[msnodesql] Invalid ', p.name, ' passed to function ', funcName, '. Type should be ', p.type, '.'].join(''))
        }
      })
    }

    validateQuery (queryOrObj, useUTC, parentFn) {
      const queryObj = this.getQueryObject(queryOrObj, useUTC)
      this.validateParameters(
        [
          new LexicalParam('string', queryObj.query_str, 'query string')
        ],
        parentFn
      )
      return queryObj
    }
  }

  return {
    NotifyFactory,
    StreamEvents,
    LexicalParam
  }
})())

exports.notifyModule = notifyModule
