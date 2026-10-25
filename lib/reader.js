/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

const { BasePromises } = require('./base-promises')
const { logger } = require('./logger')

const cancelSideEffectStates = new Set(['HY010', '24000'])

class DriverRead {
  constructor (cppDriver, queue, version) {
    this.native = cppDriver
    this.workQueue = queue
    this.useUTC = true
    this.version = version
  }

  setUseUTC (utc) {
    this.useUTC = utc
  }

  // invokeObject.begin(queryId, query, params, onInvoke)

  getQuery (notify, query, params, invokeObject, callback, operation) {
    const q = new Query(this.native, this.version, this.useUTC, notify, this.workQueue, query, params, invokeObject, callback, operation)
    notify.setQueryWorker(q)
    return q
  }
}

class Query extends BasePromises {
  constructor (native, version, useUTC, notify, queue, query, params, queryHandler, callback, operation) {
    super()
    this.operation = operation // this query's own item on the connection's work queue
    this.version = version
    this.native = native
    this.useUTC = useUTC
    this.notify = notify
    this.queue = queue
    this.query = query
    this.params = params
    this.queryHandler = queryHandler
    this.callback = callback
    this.meta = null
    this.rows = []
    this.outputParams = []
    this.rowCount = 0
    this.queryId = notify.getQueryId()
    this.queryRowIndex = 0
    this.batchRowIndex = 0
    this.batchData = null
    this.running = true
    this.paused = false
    // the one next step of the read, held while paused: resume() runs it. a read only ever
    // has one step going (a native call, or what runs when it returns), so resume must never
    // start another - two native calls on one statement at once crash the process.
    this.parked = null
    this.pausedCancelled = false
    this.done = false
    // 'done' (no more results) is raised exactly once, whatever happened, and 'free' waits
    // for it: what is to run once done is raised
    this.doneRaised = false
    this.afterDoneSteps = []
    this.rowBatchSize = 50 /* ignored for prepared statements */
    this.currentQueryResult = null
    this.cancelled = false
    this.timeoutTriggered = false
    this.context = ''

    // Setup timeout handling based on platform and driver version
    this.setupTimeoutHandling()
  }

  isInfo (err) {
    return err?.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
  }

  /* route non-critical info messages to its own event to prevent streams based readers from halting */
  // in the order the driver gave them (#478). 'more' is counted over the errors only: an
  // error has more when another error follows it, or when the batch carries on after them
  // (moreResults).
  routeStatementError (errorsAndInfo, callback, notify, moreResults = false) {
    if (!Array.isArray(errorsAndInfo)) {
      errorsAndInfo = [errorsAndInfo]
    }
    const errorCount = errorsAndInfo.filter(e => !this.isInfo(e)).length
    let errorIndex = 0
    errorsAndInfo.forEach(err => {
      const info = this.isInfo(err)
      const more = moreResults || (info ? errorIndex < errorCount : errorIndex < errorCount - 1)
      if (!info) ++errorIndex
      if (callback && !info) {
        callback(err, null, more)
      } else {
        const ev = info ? 'info' : 'error'
        if (notify) {
          const emit = () => {
            if (notify.listenerCount(ev) > 0) {
              notify.emit(ev, err, more)
            }
          }
          // the connection defers the user's callback by a tick: info that follows an error
          // in the set waits as long, so it still comes after the error
          if (callback && info && errorIndex > 0) {
            setImmediate(emit)
          } else {
            emit()
          }
        } else {
          throw new Error(err)
        }
      }
    })
  }

  async nativeGetRows (queryId, rowBatchSize) {
    logger.debugLazy(() => `queue op to native::fetchRows ${this.queryId}`, this.context)
    return this.op(cb => this.native.fetchRows(this.queryId, this.notify.getHandle(), {
      asArrays: true,
      batchSize: rowBatchSize,
      asObjects: false
    }, (e, d) => {
      // a batch can come with info, e.g. 8153 "null value is eliminated" at the end of its
      // rows: keep it with the batch, to emit after the batch's rows (continueBatch)
      if (d && Array.isArray(e) && e.length > 0 && e.every(m => this.isInfo(m))) {
        d.info = e
        cb(null, d)
      } else {
        cb(e, d)
      }
    }))
  }

  close () {
    if (this.running) {
      this.running = false
      // Clear any active timeout to prevent late-firing timeouts
      this.notify.clearTimeout()
    }
    // the query's own item is finished; its free statement is a separate item. finish is
    // idempotent, so this holds however the query stopped running
    this.queue.finish(this.operation)
  }

  // a tick on, so that it follows the user's callback, which the connection defers by one
  emitDone () {
    setImmediate(() => {
      this.done = true
      this.raiseDone()
    })
  }

  raiseDone () {
    if (this.doneRaised) return
    this.doneRaised = true
    logger.debugLazy(() => `emit done on query ${this.queryId}`, this.context)
    this.notify.emit('done', this.queryId)
    const steps = this.afterDoneSteps
    this.afterDoneSteps = []
    steps.forEach(step => step())
  }

  // run step once 'done' has been raised - 'free' never comes before it
  afterDone (step) {
    if (this.doneRaised) {
      step()
    } else {
      this.afterDoneSteps.push(step)
    }
  }

  // a set of diagnostics with no error in it: route the info now, and nothing is returned.
  // with an error in it: route nothing, and return the whole set, info included, so that
  // the error path routes it in driver order - the error first, then e.g. 3621 "The
  // statement has been terminated" (#478)
  dispatchInfoReturnErrors (e) {
    if (!e || !Array.isArray(e) || e.length === 0) return []
    if (e.some(m => !this.isInfo(m))) return e
    this.routeStatementError(e, this.callback, this.notify, false)
    return []
  }

  // what comes with the next result - info, e.g. from a PRINT, or the errors of a failed
  // statement, whether or not the batch goes on after it - is held on it: the server sent it
  // after the result before, which moveToNextResult completes first
  async nativeNextResult (queryId) {
    return new Promise((resolve, reject) => {
      logger.debugLazy(() => `native::nextResultSet ${this.queryId}`, this.context)
      this.native.nextResultSet(this.queryId, this.notify.getHandle(), (e, res) => {
        setImmediate(() => {
          const diagnostics = !e ? [] : Array.isArray(e) ? e : [e]
          if (!res && diagnostics.length > 0) {
            reject(diagnostics)
          } else {
            if (diagnostics.length > 0) {
              res.diagnostics = diagnostics
            }
            resolve(res)
          }
        })
      })
    })
  }

  // diagnostics held on a result: info is routed as info, errors with more set when the
  // batch goes on after them
  routeHeld (diagnostics, moreResults) {
    const withErrors = diagnostics.some(m => !this.isInfo(m))
    this.routeStatementError(diagnostics, this.callback, this.notify, withErrors && moreResults)
  }

  async beginQuery (queryId) {
    return new Promise((resolve, reject) => {
      logger.debugLazy(() => `call query handler begin ${this.queryId}`, this.context)
      this.queryHandler.begin(queryId, this.query, this.params, (e, queryResult, procOutputOrMore) => {
        if (queryResult) {
          this.notify.setHandle(queryResult.handle)
          this.context = `Reader: [${JSON.stringify(this.notify.getHandle())} (${this.queryId})]`
        }
        setImmediate(() => {
          if (e && queryResult.endOfResults && queryResult.endOfRows) {
            // Error with no more results - statement needs to be freed before rejecting
            logger.debugLazy(() => 'beginQuery error, no more results, ending', this.context)
            // Call end to ensure statement is freed before rejecting
            if (!Array.isArray(e)) {
              e = [e]
            }
            const msgs = this.dispatchInfoReturnErrors(e)
            if (queryResult.handle && queryResult.handle.statementId >= 0) {
              this.queryHandler.end(this.notify, this.outputParams, () => {
                logger.debugLazy(() => `query handler - error count ${msgs.length}`, this.context)
                reject(msgs)
              }, null, false)
              // the free statement now holds the queue, until free is raised
              this.close()
            } else {
              // nothing to free: the query holds the queue until it has raised done and free
              reject(msgs)
            }
          } else if (e) {
            // Error but more results available - just pass through
            resolve({
              warning: e,
              queryResult,
              procOutput: procOutputOrMore
            })
          } else {
            resolve({
              warning: e,
              queryResult,
              procOutput: procOutputOrMore
            })
          }
        })
      })
    })
  }

  dispatchRow (driverRow, currentRow) {
    for (let column = 0; column < driverRow.length; ++column) {
      let rowColumn = driverRow[column]
      if (rowColumn && this.useUTC === false) {
        if (this.meta[column].type === 'date') {
          rowColumn = new Date(rowColumn.getTime() - rowColumn.getTimezoneOffset() * -60000)
        }
      }
      if (this.callback) {
        currentRow[column] = rowColumn
      }
      this.notify.emit('column', column, rowColumn, false)
    }
  }

  getRow () {
    this.batchRowIndex++
    this.queryRowIndex++
    let currentRow
    if (this.callback) {
      currentRow = []
      this.rows.push(currentRow)
    }
    return currentRow
  }

  // console.log('fetch ', queryId)
  dispatchRows (results) {
    if (!results) { return }
    if (this.paused) {
      logger.debugLazy(() => `[${JSON.stringify(this.notify.getHandle())}] dispatchRows called but paused for queryId ${this.queryId}`, this.context)
      return
    }
    const resultRows = results.data
    if (!resultRows) { return }
    const numberRows = resultRows.length
    logger.traceLazy(() => `[${JSON.stringify(this.notify.getHandle())}] dispatchRows processing ${numberRows} rows for queryId ${this.queryId}, batchRowIndex=${this.batchRowIndex}`, this.context)

    while (!this.paused && this.batchRowIndex < numberRows) {
      const driverRow = resultRows[this.batchRowIndex]
      this.notify.emit('row', this.queryRowIndex)
      const currentRow = this.getRow()
      this.dispatchRow(driverRow, currentRow)
    }
  }

  rowsCompleted (results, more) {
    this.queryHandler.end(this.notify, this.outputParams, (err, r, freeMore, op) => {
      if (this.callback && !this.done && !this.timeoutTriggered) {
        this.callback(err, r, freeMore, op)
      }
      if (!freeMore) {
        this.emitDone()
      }
    }, results, more)
  }

  // the rows the result just read affected. a result with no count (-1), e.g. a PRINT or
  // a DDL statement on its own, reports 0
  rowsAffected (moreResults) {
    const rowCount = Math.max(this.currentQueryResult.rowCount || 0, 0)
    this.notify.emit('rowcount', rowCount)

    const state = {
      meta: null,
      rowCount
    }

    this.rowsCompleted(state, moreResults)
  }

  end (err) {
    if (this.done) return
    this.done = true

    // Clear any active timeout to prevent late-firing timeouts
    this.notify.clearTimeout()

    if (!Array.isArray(err)) {
      err = [err]
    }
    err = this.asCancelled(err)

    try {
      if (!this.cancelled) {
        this.routeStatementError(err, this.callback, this.notify)
      }
    } finally {
      // a listener that throws must not cost the query its done and free
      this.emitDone()
      this.queryHandler.end(this.notify, this.outputParams, null, null, false)
      this.close()
    }
  }

  // a cancel closes the cursor, so a fetch that follows it fails with function sequence
  // error (HY010) or invalid cursor state (24000). after our own cancel that only means
  // the query was cancelled, so report it as such.
  asCancelled (errors) {
    if (!this.notify.getCancelSent()) return errors
    const real = errors.filter(e => !this.isInfo(e))
    const fromCancel = real.length > 0 && real.every(e => cancelSideEffectStates.has(e?.sqlstate))
    if (!fromCancel) return errors
    logger.debugLazy(() => `query ${this.queryId} fetch after cancel failed with ${errors[0].sqlstate} - report as cancelled`, this.context)
    const cancelled = new Error('[msnodesql] Operation canceled')
    cancelled.sqlstate = 'HY008'
    cancelled.code = 0
    return [cancelled]
  }

  metaRows () {
    return {
      meta: this.meta,
      rows: this.rows
    }
  }

  moveToNextResult (nextResultSetInfo) {
    setImmediate(() => {
      // a pause that landed while the call was in flight: nothing more until the resume
      if (this.park(() => this.moveToNextResult(nextResultSetInfo))) return
      if (this.cancelled) {
        this.running = false
        logger.debugLazy(() => `[${this.notify.getHandle()}] query ${this.queryId} has been cancelled - ending query ${this.queryId} `, this.context)
        this.end()
        return
      }

      logger.debugLazy(() => `[${JSON.stringify(this.notify.getHandle())}] query ${this.queryId} moveToNextResult`, this.context)
      const held = nextResultSetInfo.diagnostics
      nextResultSetInfo.diagnostics = null
      const ending = nextResultSetInfo.endOfResults
      // a statement that failed and ended the batch: the query ends with its errors
      const failed = ending && held != null && held.some(m => !this.isInfo(m))
      if (failed && this.notify.getCancelSent()) {
        // a cancel ends the query at once: cancel-cb, HY008, done, free
        this.end(held)
        return
      }
      // info that comes with the end of the batch closes the result just read
      if (held && ending && !failed) this.routeHeld(held, false)
      // the result just read is complete: its rows, or the rows it affected
      const more = !ending || failed
      if (this.meta && this.meta.length === 0) {
        this.rowsAffected(more)
      } else {
        this.rowsCompleted(this.metaRows(), more)
      }
      const next = failed
        ? () => this.end(held)
        : () => this.enterResult(nextResultSetInfo, held)
      if (!more || !this.callback) {
        next()
        return
      }
      // the callback for the result just read is a tick on (the connection defers it): what
      // the next result brings waits for it, as the server sent it after
      setImmediate(() => {
        if (!this.park(next)) next()
      })
    })
  }

  // move on to the next result: what the server sent with it, then its rows
  enterResult (nextResultSetInfo, held) {
    if (held && !nextResultSetInfo.endOfResults) this.routeHeld(held, true)
    this.meta = nextResultSetInfo.meta
    if (!this.meta) {
      this.nextResult()
      return
    }
    this.rows = []
    if (nextResultSetInfo.endOfResults && nextResultSetInfo.endOfRows) {
      this.close()
    } else {
      this.currentQueryResult = nextResultSetInfo
      // if this is just a set of rows
      if (this.meta.length > 0) {
        this.notify.emit('meta', this.meta)
        // kick off reading next set of rows
        this.dispatch()
      } else {
        this.nextResult()
      }
    }
  }

  // what a native call brings back once a cancel has been sent waits for the cancel's own
  // callback: an accepted cancel is always cancel-cb, error HY008, done, free
  afterCancel (step) {
    this.notify.whenCancelSettled(step)
  }

  // park a step to run on resume, if paused. true when parked - or, for a paused query
  // that has been cancelled, when the query has ended instead.
  park (step) {
    if (!this.paused) return false
    if (this.pausedCancelled) {
      this.endPausedCancel()
      return true
    }
    logger.debugLazy(() => `paused, park next step for queryId ${this.queryId}`, this.context)
    this.parked = step
    return true
  }

  // an error from a call that was in flight when the pause landed: the error, done and
  // free all wait for the resume, and the paused query keeps holding the connection
  endOrPark (err) {
    if (!this.park(() => this.end(err))) this.end(err)
  }

  // the native statement of this paused query has been cancelled. what is parked will
  // not run, and nothing more is emitted but the end: a step still in flight ends the
  // query when it returns.
  cancelPaused () {
    this.pausedCancelled = true
    if (this.parked) this.endPausedCancel()
  }

  endPausedCancel () {
    this.parked = null
    const cancelled = new Error('[msnodesql] Operation canceled')
    cancelled.sqlstate = 'HY008'
    cancelled.code = 0
    this.end([cancelled])
  }

  dispatch () {
    if (!this.running) {
      logger.debugLazy(() => `dispatch called but not running for queryId ${this.queryId}`, this.context)
      return
    }
    if (this.park(() => this.dispatch())) return

    logger.traceLazy(() => `dispatch fetching rows for queryId ${this.queryId}, rowBatchSize=${this.rowBatchSize}`, this.context)
    this.nativeGetRows(this.queryId, this.rowBatchSize).then(d => this.afterCancel(() => {
      logger.traceLazy(() => `dispatch received ${d?.data?.length || 0} rows for queryId ${this.queryId}, endOfRows=${d?.endOfRows} endOfResults=${d?.endOfResults}`, this.context)
      this.batchRowIndex = 0
      this.batchData = d
      this.continueBatch()
    })).catch(err => this.afterCancel(() => {
      logger.debugLazy(() => `dispatch error for queryId ${this.queryId}: ${err}`, 'DriverRead.dispatch', this.context)
      this.endOrPark(err)
    }))
  }

  // emit what is left of the current batch, then fetch more, or move to the next result.
  // a pause, mid batch or on its last row, parks here until resume.
  continueBatch () {
    if (this.park(() => this.continueBatch())) return
    const d = this.batchData
    this.dispatchRows(d)
    if (this.park(() => this.continueBatch())) return
    if (d.info) {
      // the info the batch came with follows its rows, as the server sent it
      const info = d.info
      d.info = null
      this.dispatchInfoReturnErrors(info)
      if (this.park(() => this.continueBatch())) return
    }
    if (!d.endOfRows) {
      this.dispatch()
    } else if (!d.endOfResults) {
      this.nextResult()
    } else {
      d.meta = []
      this.moveToNextResult(d)
    }
  }

  nextResult () {
    if (this.park(() => this.nextResult())) return
    this.nativeNextResult(this.queryId)
      .then(nextResultSetInfo => this.afterCancel(() => {
        this.moveToNextResult(nextResultSetInfo)
      })).catch(err => this.afterCancel(() => {
        this.endOrPark(err)
      }))
  }

  // the query has executed: report what came with it, then read on
  begun (res) {
    if (res.warning) {
      this.routeStatementError(res.warning, this.callback, this.notify, !res.queryResult.endOfResults)
      if (!this.cancelled) {
        res.warning.forEach(err => {
          if (!this.cancelled) {
            this.cancelled = err.message.includes('Operation canceled')
            if (this.cancelled) {
              logger.debugLazy(() => `statement has been cancelled queryId ${this.queryId}`, this.context)
            }
          }
        })
      }
    }
    this.outputParams = res.outputParams
    this.meta = res.queryResult.meta
    this.rowCount = res.queryResult.rowCount || 0
    this.currentQueryResult = res.queryResult
    if (this.meta.length > 0) {
      this.notify.emit('meta', this.meta)
      this.dispatch()
    } else {
      this.nextResult()
    }
  }

  begin () {
    this.beginQuery(this.queryId, this.query, this.params).then(res => {
      // the handle at once, so a cancel can reach the statement; what is emitted waits
      // for a resume, if the query was paused while it executed
      this.notify.setHandle(res.queryResult.handle)
      this.afterCancel(() => {
        const begun = () => this.begun(res)
        if (!this.park(begun)) begun()
      })
    }).catch(err => this.afterCancel(() => {
      logger.debugLazy(() => `dispatch error for queryId ${this.queryId}: ${err}`, this.context)
      // Don't call end() here - it's already handled in beginQuery for binding errors
      try {
        this.routeStatementError(err, this.callback, this.notify)
      } finally {
        // a listener that throws must not cost the query its done and free
        this.emitDone()
        const handle = this.notify.getHandle()
        if (handle && handle.statementId < 0) {
          // no statement to free: free follows done, and only then may the queue move on
          this.afterDone(() => {
            this.notify.emit('free', this.queryId)
            this.close()
          })
        } else {
          this.close()
        }
      }
    }))
    this.notify.emit('submitted', this.query, this.params)
  }

  pause () {
    if (this.paused) return
    logger.debugLazy(() => `DriverRead.pause() called for queryId ${this.queryId}`, this.context)
    this.paused = true
    this.queue.park(this.operation)
    logger.debugLazy(() => `DriverRead.pause() parked operation for queryId ${this.queryId}`, this.context)
  }

  resume () {
    if (!this.paused) return
    logger.debugLazy(() => `DriverRead.resume() called for queryId ${this.queryId}`, this.context)
    this.queue.resume(this.operation)
    this.paused = false
    // nothing parked: the read's step is still running, and carries on when it returns
    const step = this.parked
    this.parked = null
    if (step) step()
    logger.debugLazy(() => `DriverRead.resume() resumed operation for queryId ${this.queryId}`, this.context)
  }

  setupTimeoutHandling () {
    const queryObj = this.notify.getQueryObj()
    const timeoutSecs = queryObj?.query_timeout || 0

    if (timeoutSecs > 0) {
      const isLinux = process.platform === 'linux'
      const isVersion17 = this.version === 17

      // Use JS-based cancel for Linux driver v17 to avoid disconnect blocking issue
      const useJsCancel = isLinux && isVersion17

      if (useJsCancel) {
        // Convert seconds to milliseconds
        const timeoutMs = timeoutSecs * 1000
        logger.debugLazy(() => `Using JS-based cancel for Linux driver v17, timeout: ${timeoutMs}ms (${timeoutSecs}s)`, this.context)

        // Set query_timeout to 0 to disable driver timeout
        queryObj.query_timeout = 0

        // Enable polling to allow cancellation
        queryObj.query_polling = true

        // Set up timeout immediately to avoid race conditions with fast-executing procedures
        logger.debugLazy(() => `Setting up immediate timeout: ${timeoutMs}ms`, this.context)

        // Setup JS timeout that will call cancel
        this.notify.setupTimeout(timeoutMs, () => {
          if (this.timeoutTriggered || this.done || this.cancelled) return
          this.timeoutTriggered = true
          this.cancelled = true
          try {
            this.pause()
            // Add a small delay to reduce race condition with statement cleanup
            setImmediate(() => {
              if (this.done) return
              this.notify.cancelQuery((e) => {
                if (this.done) return
                // Use the driver's error message (typically "Operation canceled")
                this.end(e)
              })
            })
          } catch (e) {
            if (!this.done) {
              this.end(e)
            }
          }
        })
      } else {
        logger.debugLazy(() => `Using native driver timeout: ${timeoutSecs} seconds`, this.context)
        // Let the native driver handle the timeout
      }
    }
  }
}

exports.DriverRead = DriverRead
