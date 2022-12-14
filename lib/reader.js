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

    function setUseUTC (utc) {
      useUTC = utc
    }

    // invokeObject.begin(queryId, query, params, onInvoke)

    function getQuery (notify, query, params, invokeObject, callback) {
      const q = new Query(notify, workQueue, query, params, invokeObject, callback)
      notify.setQueryWorker(q)
      return q
    }

    class Query {
      constructor (notify, queue, query, params, invokeObject, callback) {
        let meta
        let rows = []
        let outputParams = []
        const queryId = notify.getQueryId()
        let queryRowIndex = 0
        let batchRowIndex = 0
        let batchData = null
        let running = true
        let paused = false
        let done = false
        let infoFromNextResult = false

        const rowBatchSize = 50 /* ignored for prepared statements */

        function isInfo (err) {
          return err && err.sqlstate && err.sqlstate.length >= 2 && err.sqlstate.substring(0, 2) === '01'
        }

        /* route non-critical info messages to its own event to prevent streams based readers from halting */
        const routeStatementError = (errorsAndInfo, callback, notify) => {
          if (!Array.isArray(errorsAndInfo)) {
            errorsAndInfo = [errorsAndInfo]
          }
          let i = 0
          const onlyErrors = errorsAndInfo.reduce((agg, latest) => {
            if (!isInfo(latest)) {
              agg.push(latest)
            }
            return agg
          }, [])
          const errorCount = onlyErrors.length
          errorsAndInfo.forEach(err => {
            const info = isInfo(err)
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

        function close () {
          running = false
          workQueue.nextOp()
        }

        function emitDone () {
          setImmediate(() => {
            if (done) return
            done = true
            notify.emit('done', queryId)
          })
        }

        function dispatchInfoReturnErrors (e) {
          const infoMessages = []
          const errorMessages = []
          if (e && Array.isArray(e)) {
            e.forEach(errorOrInfo => {
              if (isInfo(errorOrInfo)) {
                infoMessages.push(errorOrInfo)
              } else {
                errorMessages.push(errorOrInfo)
              }
            })
          }
          if (errorMessages.length > 0) {
            return errorMessages
          } else if (infoMessages.length > 0) {
            routeStatementError(infoMessages, callback, notify, false)
          }
          return []
        }

        function nativeNextResult (queryId) {
          return new Promise((resolve, reject) => {
            infoFromNextResult = false
            native.nextResult(queryId, (e, res) => {
              setImmediate(() => {
              // may contain info messages e.g. raised by PRINT statements - do not want to reject these
                const errorMessages = e ? dispatchInfoReturnErrors(e) : []
                if (errorMessages.length > 0) {
                  reject(errorMessages)
                } else {
                  infoFromNextResult = e != null && Array.isArray(e) && e.length > 0
                  resolve(res)
                }
              })
            })
          })
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
                    columnDefinitions,
                    procOutput: procOutputOrMore
                  })
                }
              })
            })
          })
        }

        // console.log('fetch ', queryId)
        const dispatchRows = (results) => {
          if (!results) { return }
          if (paused) return
          const resultRows = results.data
          if (!resultRows) { return }
          const numberRows = resultRows.length
          while (batchRowIndex < numberRows) {
            if (paused) {
              break
            }
            const driverRow = resultRows[batchRowIndex]
            notify.emit('row', queryRowIndex)
            batchRowIndex++
            queryRowIndex++
            let currentRow
            if (callback) {
              currentRow = []
              rows[rows.length] = currentRow
            }
            for (let column = 0; column < driverRow.length; ++column) {
              let rowColumn = driverRow[column]
              if (rowColumn && useUTC === false) {
                if (meta[column].type === 'date') {
                  rowColumn = new Date(rowColumn.getTime() - rowColumn.getTimezoneOffset() * -60000)
                }
              }
              if (callback) {
                currentRow[column] = rowColumn
              }
              notify.emit('column', column, rowColumn, false)
            }
          }
        }

        function rowsCompleted (results, more) {
          invokeObject.end(notify, outputParams, (err, r, freeMore, op) => {
            if (callback) {
              callback(err, r, freeMore, op)
            }
            if (!freeMore) {
              emitDone()
            }
          }, results, more)
        }

        function rowsAffected (nextResultSetInfo) {
          const rowCount = nextResultSetInfo.rowCount
          const preRowCount = nextResultSetInfo.preRowCount
          const moreResults = !nextResultSetInfo.endOfResults || infoFromNextResult
          notify.emit('rowcount', preRowCount)

          const state = {
            meta: null,
            rowcount: rowCount
          }

          rowsCompleted(state, moreResults)
        }

        function end (err) {
          invokeObject.end(notify, outputParams, () => {
            if (!Array.isArray(err)) {
              err = [err]
            }
            routeStatementError(err, callback, notify)
          }, null, false)
          close()
        }

        function moveToNextResult (nextResultSetInfo) {
          setImmediate(() => {
            if (!meta) {
              rowsCompleted(
                {
                  meta,
                  rows
                },
                !nextResultSetInfo.endOfResults)
            } else if (infoFromNextResult) {
              rowsAffected(nextResultSetInfo)
              nextResult()
              return
            } else if (meta && meta.length === 0) {
            // handle the just finished result reading
            // if there was no metadata, then pass the row count (rows affected)
              rowsAffected(nextResultSetInfo)
            } else {
              rowsCompleted(
                {
                  meta,
                  rows
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
            batchRowIndex = 0
            batchData = d
            dispatchRows(d)
            if (!d.end_rows) {
              dispatch()
            } else {
              nextResult()
            }
          }).catch(err => {
            end(err)
          })
        }

        const nextResult = () => {
          infoFromNextResult = false
          nativeNextResult(queryId).then(nextResultSetInfo => {
            moveToNextResult(nextResultSetInfo)
          }).catch(err => {
            end(err)
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
            end(err)
          })
          notify.emit('submitted', query, params)
        }

        function pause () {
          if (paused) return
          paused = true
          queue.park(notify.getOperation())
        }

        function resume () {
          if (!paused) return
          queue.resume(notify.getOperation())
          paused = false
          dispatchRows(batchData)
          dispatch()
        }
        this.begin = begin
        this.pause = pause
        this.resume = resume
      }
    }

    return {
      setUseUTC,
      getQuery
    }
  }

  return {
    DriverRead
  }
})())

exports.readerModule = readerModule
