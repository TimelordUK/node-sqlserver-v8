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

    const fetch = (notify, query, params, invokeObject, callback) => {
      let meta
      let rows = []
      let outputParams = []
      const queryId = notify.getQueryId()
      let rowIndex = 0

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

      const onNextResult = async (nextResultSetInfo) => {
        setImmediate(async () => {
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
            // if more is true, no error set or results do not call back.
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
            await nextResult()
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
              await dispatch()
            } else {
              await nextResult()
            }
          }
        })
      }

      const dispatch = async () => {
        try {
          let rows = null
          while (!rows || !rows.end_rows) {
            rows = await nativeGetRows(queryId, rowBatchSize)
            dispatchRows(rows)
          }
          await nextResult()
        } catch (err) {
          routeStatementError(err, callback, notify, false)
          workQueue.nextOp()
        }
      }

      const nextResult = async () => {
        const nextResultSetInfo = await nativeNextResult(queryId)
        onNextResult(nextResultSetInfo)
      }

      const onInvoke = async (err, columnDefinitions, procOutputOrMore) => {
        outputParams = procOutputOrMore

        if (err) {
          if (!procOutputOrMore) {
            invokeObject.end(queryId, outputParams, () => {
              if (!Array.isArray(err)) {
                err = [err]
              }
              routeStatementError(err, callback, notify)
            }, null, false)
            workQueue.nextOp()
            return
          }
          routeStatementError(err, callback, notify)
        }

        meta = columnDefinitions
        if (meta.length > 0) {
          notify.emit('meta', meta)
          await dispatch()
        } else {
          await nextResult()
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
