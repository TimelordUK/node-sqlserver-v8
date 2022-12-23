/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

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

class QueryHandler {
  constructor (cppDriver) {
    this.cppDriver = cppDriver
  }

  begin (queryId, query, params, callback) { }
  end (queryId, outputParams, callback, results, more) { }
}

class NativePreparedQueryHandler extends QueryHandler {
  begin (queryId, query, params, callback) {
    this.cppDriver.bindQuery(queryId, params, (err, meta) => {
      if (callback) {
        callback(err, meta)
      }
    })
  }

  end (queryId, outputParams, callback, results, more) {
    if (callback) {
      callback(null, results, more, outputParams)
    }
  }
}

class NativeQueryHandler extends QueryHandler {
  constructor (cppDriver, onStatementComplete) {
    super(cppDriver)
    this.onStatementComplete = onStatementComplete
  }

  begin (queryId, query, params, callback) {
    this.cppDriver.query(queryId, query, params, (err, results, more) => {
      if (callback) {
        callback(err, results, more)
      }
    })
  }

  end (not, outputParams, callback, results, endMore) {
    this.onStatementComplete(not, outputParams, callback, results, endMore)
  }
}

class NativeProcedureQueryHandler extends QueryHandler {
  constructor (cppDriver, onStatementComplete, workQueue, unbindEnum) {
    super(cppDriver)
    this.onStatementComplete = onStatementComplete
    this.workQueue = workQueue
    this.unbindEnum = unbindEnum
  }

  begin (queryId, procedure, params, callback) {
    this.cppDriver.callProcedure(queryId, procedure, params, (err, results, params) => {
      if (callback) {
        callback(err, results, params)
      }
    })
  }

  // for a stored procedure with multiple statements, only unbind after all
  // statements are completed

  unbind (more, not, qid, results, callback) {
    this.cppDriver.unbind(qid, (err, outputVector) => {
      if (err && callback) {
        callback(err, results)
      }
      not.emit('output', outputVector)
      this.onStatementComplete(not, outputVector, callback, results, more)
      if (!more) {
        this.workQueue.nextOp()
      }
    })
  }

  end (not, outputParams, callback, results, endMore) {
    if (!endMore) {
      const qid = not.getQueryId()
      this.workQueue.enqueue(this.unbindEnum, (a) =>
        setImmediate(() => this.unbind(a, not, qid, results, callback)), [endMore])
    } else {
      this.onStatementComplete(not, null, callback, results, endMore)
    }
  }
}

class Query {
  constructor (native, useUTC, notify, queue, query, params, queryHandler, callback) {
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
    return err && err.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
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

  nativeGetRows (queryId, rowBatchSize) {
    return new Promise((resolve, reject) => {
      this.native.readColumn(queryId, rowBatchSize, (e, res) => {
        setImmediate(() => {
          if (e) {
            reject(e)
          } else {
            resolve(res)
          }
        })
      })
    })
  }

  close () {
    this.running = false
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

  nativeNextResult (queryId) {
    return new Promise((resolve, reject) => {
      this.infoFromNextResult = false
      this.native.nextResult(queryId, (e, res) => {
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

  beginQuery (queryId) {
    return new Promise((resolve, reject) => {
      this.queryHandler.begin(queryId, this.query, this.params, (e, columnDefinitions, procOutputOrMore) => {
        setImmediate(() => {
          if (e && !procOutputOrMore) {
            reject(e)
          } else {
            resolve({
              warning: e,
              columnDefinitions,
              procOutput: procOutputOrMore
            })
          }
        })
      })
    })
  }

  // console.log('fetch ', queryId)
  dispatchRows (results) {
    if (!results) { return }
    if (this.paused) return
    const resultRows = results.data
    if (!resultRows) { return }
    const numberRows = resultRows.length
    while (this.batchRowIndex < numberRows) {
      if (this.paused) {
        break
      }
      const driverRow = resultRows[this.batchRowIndex]
      this.notify.emit('row', this.queryRowIndex)
      this.batchRowIndex++
      this.queryRowIndex++
      let currentRow
      if (this.callback) {
        currentRow = []
        this.rows.push(currentRow)
      }
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
    const preRowCount = nextResultSetInfo.preRowCount
    const moreResults = !nextResultSetInfo.endOfResults || this.infoFromNextResult
    this.notify.emit('rowcount', preRowCount)

    const state = {
      meta: null,
      rowcount: rowCount
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
    }
  }

  moveToNextResult (nextResultSetInfo) {
    setImmediate(() => {
      if (!this.meta) {
        this.rowsCompleted(this.metaRows(),
          !nextResultSetInfo.endOfResults)
      } else if (this.infoFromNextResult) {
        this.rowsAffected(nextResultSetInfo)
        this.nextResult()
        return
      } else if (this.meta && this.meta.length === 0) {
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
      if (nextResultSetInfo.endOfResults) {
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
    if (!this.running) return
    if (this.paused) return // will come back at some later stage

    this.nativeGetRows(this.queryId, this.rowBatchSize).then(d => {
      this.batchRowIndex = 0
      this.batchData = d
      this.dispatchRows(d)
      if (!d.end_rows) {
        this.dispatch()
      } else {
        this.nextResult()
      }
    }).catch(err => {
      this.end(err)
    })
  }

  nextResult () {
    this.infoFromNextResult = false
    this.nativeNextResult(this.queryId).then(nextResultSetInfo => {
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
      this.meta = res.columnDefinitions
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
    this.paused = true
    this.queue.park(this.notify.getOperation())
  }

  resume () {
    if (!this.paused) return
    this.queue.resume(this.notify.getOperation())
    this.paused = false
    this.dispatchRows(this.batchData)
    this.dispatch()
  }
}

exports.DriverRead = DriverRead
exports.NativePreparedQueryHandler = NativePreparedQueryHandler
exports.NativeQueryHandler = NativeQueryHandler
exports.NativeProcedureQueryHandler = NativeProcedureQueryHandler
