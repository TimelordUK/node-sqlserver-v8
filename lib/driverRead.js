/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

function DriverRead (n, q) {
  var native = n
  var workQueue = q
  var useUTC = true

  function setUseUTC (utc) {
    useUTC = utc
  }

  function routeStatementError (err, callback, notify, more) {
    if (callback) {
      callback(err, null, more)
    } else if (notify && notify.listeners('error').length > 0) {
      notify.emit('error', err)
    } else {
      throw new Error(err)
    }
  }

  function fetch (notify, query, params, invokeObject, callback) {
    var meta
    var column
    var rows = []
    var rowindex = 0
    var outputParams = []

    var queryId = notify.getQueryId()

    function onReadColumnMore (err, results) {
      setImmediate(function queuedOnReadColumnMore () {
        if (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
          return
        }

        var data = results.data
        var more = results.more

        notify.emit('column', column, data, more)

        if (callback) {
          rows[rows.length - 1][column] += data
        }

        if (more) {
          native.readColumn(queryId, column, onReadColumnMore)
          return
        }

        column += 1
        if (column >= meta.length) {
          native.readRow(queryId, onReadRow)
          return
        }

        native.readColumn(queryId, column, onReadColumn)
      })
    }

    function onReadColumn (err, results) {
      setImmediate(function queuedOnReadColumn () {
        if (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
          return
        }

        var data = results.data
        var more = results.more

        if (data && useUTC === false) {
          if (meta[column].type === 'date') {
            data = new Date(data.getTime() - data.getTimezoneOffset() * -60000)
          }
        }

        notify.emit('column', column, data, more)

        if (callback) {
          rows[rows.length - 1][column] = data
        }

        if (more) {
          native.readColumn(queryId, column, onReadColumnMore)
          return
        }

        column += 1

        if (column >= meta.length) {
          native.readRow(queryId, onReadRow)
          return
        }
        native.readColumn(queryId, column, onReadColumn)
      })
    }

    function rowsCompleted (results, more) {
      if (!more) {
        notify.emit('done')
      }

      invokeObject.end(queryId, outputParams, callback, results, more)
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
          rowsCompleted({meta: meta, rows: rows}, !nextResultSetInfo.endOfResults)
        } else if (meta && !err && meta.length === 0) {
          // handle the just finished result reading
          // if there was no metadata, then pass the row count (rows affected)
          rowsAffected(nextResultSetInfo)
        } else {
          var completed = more && rows && rows.length === 0
          // if more is true, no error set or results do not call back.
          if (!completed) {
            rowsCompleted({meta: meta, rows: rows}, !nextResultSetInfo.endOfResults)
          }
        }

        // reset for the next resultset
        meta = nextResultSetInfo.meta
        if (!meta) {
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
            native.readRow(queryId, onReadRow)
          } else {
            native.nextResult(queryId, onNextResult)
          }
        }
      })
    }

    function onReadRow (err, endOfRows) {
      setImmediate(function queuedOnReadRow () {
        if (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
        } else if (meta.length > 0 && !endOfRows) {
          // if there were rows and we haven't reached the end yet (like EOF)
          notify.emit('row', rowindex)
          rowindex += 1
          column = 0
          if (callback) {
            rows[rows.length] = []
          }
          native.readColumn(queryId, column, onReadColumn)
        } else {
          // otherwise, go to the next result set
          native.nextResult(queryId, onNextResult)
        }
      })
    }

    function onInvoke (err, results, params) {
      outputParams = params

      if (err) {
        var more = params
        if (!more) {
          invokeObject.end(queryId, outputParams, function () {
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
        native.readRow(queryId, onReadRow)
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

exports.DriverRead = DriverRead
