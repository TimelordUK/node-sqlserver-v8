/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

var readerModule = (function () {
  function DriverRead (cppDriver, queue) {
    var native = cppDriver
    var workQueue = queue
    var useUTC = true
    var rowBatchSize = 50 /* ignored for prepared statements */
    function setUseUTC (utc) {
      useUTC = utc
    }

    /* route non critical info messages to its own event to prevent streams based readers from halting */
    function routeStatementError (errors, callback, notify, more) {
      var i = 0
      errors.forEach(function (err) {
        var info = err && err.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
        if (callback && !info) {
          callback(err, null, more || i < errors.length - 1)
        } else {
          var ev = info ? 'info' : 'error'
          if (notify) {
            notify.emit(ev, err, i < errors.length - 1)
          } else {
            throw new Error(err)
          }
        }
        ++i
      })
    }

    function fetch (notify, query, params, invokeObject, callback) {
      var meta
      var rows = []
      var outputParams = []
      var queryId = notify.getQueryId()
      var rowIndex = 0

      function onReadRow (err, results) {
        if (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
          return
        }

        var resultRows = results.data
        if (resultRows) {
          resultRows.forEach(function (data) {
            var column = 0
            notify.emit('row', rowIndex++)
            var currentRow
            if (callback) {
              rows[rows.length] = []
              currentRow = rows[rows.length - 1]
            }
            data.forEach(function (colData) {
              if (callback) {
                if (colData && useUTC === false) {
                  if (meta[column].type === 'date') {
                    colData = new Date(colData.getTime() - colData.getTimezoneOffset() * -60000)
                  }
                }
                currentRow[column] = colData
              }
              notify.emit('column', column, colData, false)
              column++
            })
          })
        }

        if (results.end_rows) {
          native.nextResult(queryId, onNextResult)
        } else {
          native.readColumn(queryId, rowBatchSize, onReadRow)
        }
      }

      function rowsCompleted (results, more) {
        invokeObject.end(queryId, outputParams, function (err, r, freeMore, op) {
          if (callback) {
            callback(err, r, freeMore, op)
          }
          if (!freeMore) {
            setImmediate(function () {
              notify.emit('done')
            })
          }
        }, results, more)
      }

      function rowsAffected (nextResultSetInfo) {
        var rowCount = nextResultSetInfo.rowCount
        var preRowCount = nextResultSetInfo.preRowCount
        var moreResults = !nextResultSetInfo.endOfResults
        notify.emit('rowcount', preRowCount)

        var state = {
          meta: null,
          rowcount: rowCount
        }

        rowsCompleted(state, moreResults)
      }

      function onNextResult (err, nextResultSetInfo, more) {
        setImmediate(function queuedOnNextResult () {
          if (err) {
            routeStatementError(err, callback, notify, more)
            if (!more) {
              workQueue.nextOp()
              return
            }
          }

          if (!meta && !more) {
            rowsCompleted(
              {
                meta: meta,
                rows: rows },
              !nextResultSetInfo.endOfResults)
          } else if (meta && !err && meta.length === 0) {
            // handle the just finished result reading
            // if there was no metadata, then pass the row count (rows affected)
            rowsAffected(nextResultSetInfo)
          } else {
            var completed = more && rows && rows.length === 0
            // if more is true, no error set or results do not call back.
            if (!completed) {
              rowsCompleted(
                {
                  meta: meta,
                  rows: rows },
                !nextResultSetInfo.endOfResults)
            }
          }

          // reset for the next resultset
          meta = nextResultSetInfo.meta
          if (more || !meta) {
            native.nextResult(queryId, onNextResult)
            return
          }
          rows = []
          if (nextResultSetInfo.endOfResults) {
            // What about closed connections due to more being false in the callback?  See queryRaw below.
            workQueue.nextOp()
          } else {
            // if this is just a set of rows
            if (meta.length > 0) {
              notify.emit('meta', meta)
              // kick off reading next set of rows
              native.readColumn(queryId, rowBatchSize, onReadRow)
            } else {
              native.nextResult(queryId, onNextResult)
            }
          }
        })
      }

      function onInvoke (err, results, params) {
        outputParams = params

        if (err) {
          var more = params
          if (!more) {
            invokeObject.end(queryId, outputParams, function () {
              if (!Array.isArray(err)) {
                err = [err]
              }
              routeStatementError(err, callback, notify, false)
            }, null, more)
            workQueue.nextOp()
            return
          }
          routeStatementError(err, callback, notify, true)
        }

        meta = results
        if (meta.length > 0) {
          notify.emit('meta', meta)
          native.readColumn(queryId, rowBatchSize, onReadRow)
        } else {
          native.nextResult(queryId, onNextResult)
        }
      }

      invokeObject.begin(queryId, query, params, onInvoke)
      notify.emit('submitted', query, params)
    }

    return {
      setUseUTC: setUseUTC,
      fetch: fetch
    }
  }

  return {
    DriverRead: DriverRead
  }
}())

exports.readerModule = readerModule
