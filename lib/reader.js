/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

const { BasePromises } = require('./base-promises')
const { logger } = require('./logger')

class DriverRead {
  constructor (cppDriver, queue) {
    this.native = cppDriver
    this.workQueue = queue
    this.useUTC = true
  }

  setUseUTC (utc) {
    this.useUTC = utc
  }

  // invokeObject.begin(queryId, query, params, onInvoke)

  getQuery (notify, query, params, invokeObject, callback) {
    const q = new Query(this.native, this.useUTC, notify, this.workQueue, query, params, invokeObject, callback)
    notify.setQueryWorker(q)
    return q
  }
}

class Query extends BasePromises {
  constructor (native, useUTC, notify, queue, query, params, queryHandler, callback) {
    super()
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
    this.done = false
    this.infoFromNextResult = false
    this.rowBatchSize = 50 /* ignored for prepared statements */
  }

  isInfo (err) {
    return err?.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
  }

  /* route non-critical info messages to its own event to prevent streams based readers from halting */
  routeStatementError (errorsAndInfo, callback, notify) {
    if (!Array.isArray(errorsAndInfo)) {
      errorsAndInfo = [errorsAndInfo]
    }
    let i = 0
    const onlyErrors = errorsAndInfo.reduce((agg, latest) => {
      if (!this.isInfo(latest)) {
        agg.push(latest)
      }
      return agg
    }, [])
    const errorCount = onlyErrors.length
    errorsAndInfo.forEach(err => {
      const info = this.isInfo(err)
      if (callback && !info) {
        const more = i < errorsAndInfo.length - 1
        callback(err, null, more)
      } else {
        const ev = info ? 'info' : 'error'
        if (notify) {
          const more = i < errorCount - 1
          if (notify.listenerCount(ev) > 0) {
            notify.emit(ev, err, more)
          }
        } else {
          throw new Error(err)
        }
      }
      ++i
    })
  }

  async nativeGetRows (queryId, rowBatchSize) {
    logger.debugLazy(() => `queue op to native::fetchRows ${this.queryId}`, 'DriverRead.nativeGetRows')
    return this.op(cb => this.native.fetchRows(this.notify.getHandle(), {
      asArrays: true,
      batchSize: rowBatchSize,
      asObjects: false
    }, cb))
  }

  close () {
    this.running = false
    // Don't call nextOp here - it should be called after statement is freed
    this.queue.nextOp()
  }

  emitDone () {
    setImmediate(() => {
      if (this.done) return
      this.done = true
      this.notify.emit('done', this.queryId)
    })
  }

  dispatchInfoReturnErrors (e) {
    const infoMessages = []
    const errorMessages = []

    if (e && Array.isArray(e)) {
      e.forEach(errorOrInfo => {
        if (this.isInfo(errorOrInfo)) {
          infoMessages.push(errorOrInfo)
        } else {
          errorMessages.push(errorOrInfo)
        }
      })
    }
    if (errorMessages.length > 0) {
      return errorMessages
    } else if (infoMessages.length > 0) {
      this.routeStatementError(infoMessages, this.callback, this.notify, false)
    }
    return []
  }

  async nativeNextResult (queryId) {
    return new Promise((resolve, reject) => {
      this.infoFromNextResult = false
      logger.debugLazy(() => `native::nextResultSet ${this.queryId}`, 'DriverRead.nativeNextResult')
      this.native.nextResultSet(this.notify.getHandle(), (e, res) => {
        setImmediate(() => {
          // may contain info messages e.g. raised by PRINT statements - do not want to reject these
          const errorMessages = e ? this.dispatchInfoReturnErrors(e) : []
          if (errorMessages.length > 0) {
            reject(errorMessages)
          } else {
            this.infoFromNextResult = e != null && Array.isArray(e) && e.length > 0
            resolve(res)
          }
        })
      })
    })
  }

  async beginQuery (queryId) {
    return new Promise((resolve, reject) => {
      logger.debugLazy(() => `call query handler begin ${this.queryId}`, 'DriverRead.beginQuery')
      this.queryHandler.begin(queryId, this.query, this.params, (e, queryResult, procOutputOrMore) => {
        setImmediate(() => {
          if (e && !procOutputOrMore) {
            reject(e)
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
      logger.debugLazy(() => `dispatchRows called but paused for queryId ${this.queryId}`, 'DriverRead.dispatchRows')
      return
    }
    const resultRows = results.data
    if (!resultRows) { return }
    const numberRows = resultRows.length
    logger.traceLazy(() => `dispatchRows processing ${numberRows} rows for queryId ${this.queryId}, batchRowIndex=${this.batchRowIndex}`, 'DriverRead.dispatchRows')

    while (!this.paused && this.batchRowIndex < numberRows) {
      const driverRow = resultRows[this.batchRowIndex]
      this.notify.emit('row', this.queryRowIndex)
      const currentRow = this.getRow()
      this.dispatchRow(driverRow, currentRow)
    }
  }

  rowsCompleted (results, more) {
    this.queryHandler.end(this.notify, this.outputParams, (err, r, freeMore, op) => {
      if (this.callback) {
        this.callback(err, r, freeMore, op)
      }
      if (!freeMore) {
        this.emitDone()
      }
    }, results, more)
  }

  rowsAffected (nextResultSetInfo) {
    const rowCount = nextResultSetInfo.rowCount
    const moreResults = !nextResultSetInfo.endOfResults || this.infoFromNextResult
    this.notify.emit('rowcount', rowCount)

    const state = {
      meta: null,
      rowCount
    }

    this.rowsCompleted(state, moreResults)
  }

  end (err) {
    this.queryHandler.end(this.notify, this.outputParams, () => {
      if (!Array.isArray(err)) {
        err = [err]
      }
      this.routeStatementError(err, this.callback, this.notify)
    }, null, false)
    this.close()
  }

  metaRows () {
    return {
      meta: this.meta,
      rows: this.rows
      // rowCount: this.rowCount || 0
    }
  }

  moveToNextResult (nextResultSetInfo) {
    setImmediate(() => {
      const nextMeta = nextResultSetInfo.meta
      const nextNullEmptyMeta = nextMeta == null || nextMeta.length === 0
      const thisEmptyMeta = this.meta && this.meta.length === 0
      if (!this.meta) {
        this.rowsCompleted(this.metaRows(),
          !nextResultSetInfo.endOfResults)
      } else if (this.infoFromNextResult && nextNullEmptyMeta) {
        this.rowsAffected(nextResultSetInfo)
        this.nextResult()
        return
      } else if (thisEmptyMeta) {
        // handle the just finished result reading
        // if there was no metadata, then pass the row count (rows affected)
        this.rowsAffected(nextResultSetInfo)
      } else {
        this.rowsCompleted(this.metaRows(),
          !nextResultSetInfo.endOfResults)
      }

      // reset for the next resultset
      this.meta = nextResultSetInfo.meta
      if (!this.meta) {
        this.nextResult()
        return
      }
      this.rows = []
      if (nextResultSetInfo.endOfResults && nextResultSetInfo.endOfRows) {
        this.close()
      } else {
        // if this is just a set of rows
        if (this.meta.length > 0) {
          this.notify.emit('meta', this.meta)
          // kick off reading next set of rows
          this.dispatch()
        } else {
          this.nextResult()
        }
      }
    })
  }

  dispatch () {
    if (!this.running) {
      logger.debugLazy(() => `dispatch called but not running for queryId ${this.queryId}`, 'DriverRead.dispatch')
      return
    }
    if (this.paused) {
      logger.debugLazy(() => `dispatch called but paused for queryId ${this.queryId}`, 'DriverRead.dispatch')
      return // will come back at some later stage
    }

    logger.traceLazy(() => `dispatch fetching rows for queryId ${this.queryId}, rowBatchSize=${this.rowBatchSize}`, 'DriverRead.dispatch')
    this.nativeGetRows(this.queryId, this.rowBatchSize).then(d => {
      logger.traceLazy(() => `dispatch received ${d?.data?.length || 0} rows for queryId ${this.queryId}, endOfRows=${d?.endOfRows}`, 'DriverRead.dispatch')
      this.batchRowIndex = 0
      this.batchData = d
      this.dispatchRows(d)
      if (!d.endOfRows) {
        this.dispatch()
      } else {
        this.nextResult()
      }
    }).catch(err => {
      logger.debugLazy(() => `dispatch error for queryId ${this.queryId}: ${err}`, 'DriverRead.dispatch')
      this.end(err)
    })
  }

  nextResult () {
    this.infoFromNextResult = false
    this.nativeNextResult(this.queryId)
      .then(nextResultSetInfo => {
        this.moveToNextResult(nextResultSetInfo)
      }).catch(err => {
        this.end(err)
      })
  }

  begin () {
    this.beginQuery(this.queryId, this.query, this.params).then(res => {
      if (res.warning) {
        this.routeStatementError(res.warning, this.callback, this.notify)
      }
      this.outputParams = res.outputParams
      this.meta = res.queryResult.meta
      this.rowCount = res.queryResult.rowCount || 0
      this.notify.setHandle(res.queryResult.handle)
      if (this.meta.length > 0) {
        this.notify.emit('meta', this.meta)
        this.dispatch()
      } else {
        this.nextResult()
      }
    }).catch(err => {
      this.end(err)
    })
    this.notify.emit('submitted', this.query, this.params)
  }

  pause () {
    if (this.paused) return
    logger.debugLazy(() => `DriverRead.pause() called for queryId ${this.queryId}`, 'DriverRead.pause')
    this.paused = true
    this.queue.park(this.notify.getOperation())
    logger.debugLazy(() => `DriverRead.pause() parked operation for queryId ${this.queryId}`, 'DriverRead.pause')
  }

  resume () {
    if (!this.paused) return
    logger.debugLazy(() => `DriverRead.resume() called for queryId ${this.queryId}`, 'DriverRead.resume')
    this.queue.resume(this.notify.getOperation())
    this.paused = false
    this.dispatchRows(this.batchData)
    this.dispatch()
    logger.debugLazy(() => `DriverRead.resume() resumed operation for queryId ${this.queryId}`, 'DriverRead.resume')
  }
}

exports.DriverRead = DriverRead
