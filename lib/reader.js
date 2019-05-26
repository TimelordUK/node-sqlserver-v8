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
    const routeStatementError = (errors, callback, notify) => {
      let i = 0
      errors.forEach(err => {
        const info = err && err.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
        if (callback && !info) {
          callback(err, null, i < errors.length - 1)
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

    function nativeGetRows (queryId, rowBatchSize) {
      return new Promise((resolve, reject) => {
        native.readColumn(queryId, rowBatchSize, (e, res) => {
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

    function nativeNextResult (queryId) {
      return new Promise((resolve, reject) => {
        native.nextResult(queryId, (e, res) => {
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

    // invokeObject.begin(queryId, query, params, onInvoke)

    function Query (notify, query, params, invokeObject, callback) {
      let meta
      let rows = []
      let outputParams = []
      const queryId = notify.getQueryId()
      let rowIndex = 0
      let running = true
      let paused = false

      function close () {
        running = false
        workQueue.nextOp()
      }

      function beginQuery (queryId) {
        return new Promise((resolve, reject) => {
          invokeObject.begin(queryId, query, params, (e, columnDefinitions, procOutputOrMore) => {
            setImmediate(() => {
              if (e && !procOutputOrMore) {
                reject(e)
              } else {
                resolve({
                  warning: e,
                  columnDefinitions: columnDefinitions,
                  procOutput: procOutputOrMore
                })
              }
            })
          })
        })
      }

      // console.log('fetch ', queryId)
      const dispatchRows = (results) => {
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
      }

      const rowsCompleted = (results, more) => {
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

      const rowsAffected = nextResultSetInfo => {
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

      const moveToNextResult = (nextResultSetInfo) => {
        setImmediate(() => {
          if (!meta) {
            rowsCompleted(
              {
                meta: meta,
                rows: rows
              },
              !nextResultSetInfo.endOfResults)
          } else if (meta && meta.length === 0) {
            // handle the just finished result reading
            // if there was no metadata, then pass the row count (rows affected)
            rowsAffected(nextResultSetInfo)
          } else {
            rowsCompleted(
              {
                meta: meta,
                rows: rows
              },
              !nextResultSetInfo.endOfResults)
          }

          // reset for the next resultset
          meta = nextResultSetInfo.meta
          if (!meta) {
            nextResult()
            return
          }
          rows = []
          if (nextResultSetInfo.endOfResults) {
            close()
          } else {
            // if this is just a set of rows
            if (meta.length > 0) {
              notify.emit('meta', meta)
              // kick off reading next set of rows
              dispatch()
            } else {
              nextResult()
            }
          }
        })
      }

      function dispatch () {
        if (!running) return
        if (paused) return // will come back at some later stage

        nativeGetRows(queryId, rowBatchSize).then(d => {
          dispatchRows(d)
          if (!d.end_rows) {
            dispatch()
          } else {
            nextResult()
          }
        }).catch(err => {
          routeStatementError(err, callback, notify, false)
          close()
        })
      }

      const nextResult = () => {
        nativeNextResult(queryId).then(nextResultSetInfo => {
          moveToNextResult(nextResultSetInfo)
        }).catch(err => {
          routeStatementError(err, callback, notify, false)
          close()
        })
      }

      function begin () {
        beginQuery(queryId, query, params).then(res => {
          if (res.warning) {
            routeStatementError(res.warning, callback, notify)
          }
          outputParams = res.outputParams
          meta = res.columnDefinitions
          if (meta.length > 0) {
            notify.emit('meta', meta)
            dispatch()
          } else {
            nextResult()
          }
        }).catch(err => {
          invokeObject.end(queryId, outputParams, () => {
            if (!Array.isArray(err)) {
              err = [err]
            }
            routeStatementError(err, callback, notify)
          }, null, false)
          close()
        })
        notify.emit('submitted', query, params)
      }

      function pause () {
        paused = true
      }

      function resume () {
        paused = false
        dispatch()
      }

      return {
        begin: begin,
        pause: pause,
        resume: resume
      }
    }

    function getQuery (notify, query, params, invokeObject, callback) {
      const q = new Query(notify, query, params, invokeObject, callback)
      notify.setQueryWorker(q)
      return q
    }

    return {
      setUseUTC: setUseUTC,
      getQuery: getQuery
    }
  }

  return {
    DriverRead: DriverRead
  }
})())

exports.readerModule = readerModule
