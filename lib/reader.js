/**
 * Created by Stephen on 28/06/2017.
 */

// the main work horse that manages a query from start to finish by interacting with the c++

'use strict'

const readerModule = ((() => {
  function DriverRead (cppDriver, queue) {
    const native = cppDriver
    const workQueue = queue
    let useUTC = true
    const rowBatchSize = 50 /* ignored for prepared statements */
    function setUseUTC (utc) {
      useUTC = utc
    }

    /* route non critical info messages to its own event to prevent streams based readers from halting */
    function routeStatementError (errors, callback, notify, more) {
      let i = 0
      errors.forEach(err => {
        const info = err && err.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
        if (callback && !info) {
          callback(err, null, more || i < errors.length - 1)
        } else {
          const ev = info ? 'info' : 'error'
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
      let meta
      let rows = []
      let outputParams = []
      const queryId = notify.getQueryId()
      let rowIndex = 0

      // console.log('fetch ', queryId)
      function onReadRow (err, results) {
        if (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
          return
        }

        const resultRows = results.data
        if (resultRows) {
          resultRows.forEach(data => {
            let column = 0
            notify.emit('row', rowIndex++)
            let currentRow
            if (callback) {
              rows[rows.length] = []
              currentRow = rows[rows.length - 1]
            }
            data.forEach(colData => {
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
        invokeObject.end(queryId, outputParams, (err, r, freeMore, op) => {
          if (callback) {
            callback(err, r, freeMore, op)
          }
          if (!freeMore) {
            setImmediate(() => {
              notify.emit('done')
            })
          }
        }, results, more)
      }

      function rowsAffected (nextResultSetInfo) {
        const rowCount = nextResultSetInfo.rowCount
        const preRowCount = nextResultSetInfo.preRowCount
        const moreResults = !nextResultSetInfo.endOfResults
        notify.emit('rowcount', preRowCount)

        const state = {
          meta: null,
          rowcount: rowCount
        }

        rowsCompleted(state, moreResults)
      }

      function onNextResult (err, nextResultSetInfo, more) {
        setImmediate(() => {
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
                rows: rows
              },
              !nextResultSetInfo.endOfResults)
          } else if (meta && !err && meta.length === 0) {
            // handle the just finished result reading
            // if there was no metadata, then pass the row count (rows affected)
            rowsAffected(nextResultSetInfo)
          } else {
            const completed = more && rows && rows.length === 0
            // if more is true, no error set or results do not call back.
            if (!completed) {
              rowsCompleted(
                {
                  meta: meta,
                  rows: rows
                },
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
            invokeObject.end(queryId, outputParams, () => {
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
})())

exports.readerModule = readerModule
