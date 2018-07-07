/* global: bindQuery */

'use strict'

var driverModule = (function () {
  var readerModule = require('./reader').readerModule
  var queueModule = require('./queue').queueModule

  function DriverMgr (sql) {
    var driverCommandEnum = {
      CANCEL: 10,
      COMMIT: 11,
      ROLLBACK: 12,
      BEGIN_TRANSACTION: 13,
      PREPARE: 14,
      FREE_STATEMENT: 15,
      QUERY: 16,
      CLOSE: 17,
      UNBIND: 18
    }

    var cppDriver = sql
    var workQueue = new queueModule.WorkQueue()
    var reader = new readerModule.DriverRead(cppDriver, workQueue)

    function setUseUTC (utc) {
      reader.setUseUTC(utc)
    }

    function emptyQueue () {
      workQueue.emptyQueue()
    }

    function close (callback) {
      workQueue.enqueue(driverCommandEnum.CLOSE, function () {
        cppDriver.close(function () {
          callback()
        })
      }, [])
    }

    function execCancel (qid, i, callback) {
      // send cancel directly to driver.
      var currentItem = workQueue.get(i)
      var args = currentItem.args
      var cb = args[3]

      if (i === 0) {
        cppDriver.pollingMode(qid, true, function () {
          cppDriver.cancelQuery(qid, function (err) {
            setImmediate(function () {
              if (err && err.length > 0) {
                callback(err[0])
              } else {
                callback(null)
              }
            })
          })
        })
      } else {
        workQueue.dropItem(i)
        setImmediate(function () {
          // make a callback on the cancel request with no error.
          callback(null)
          // invoke the listener as if this has come from driver so user query callback can be invoked.
          cb(new Error('Error: [msnodesql] (query removed from q) Operation canceled'))
        })
      }
      return true
    }

    // if this relates to the active query being executed then immediately send
    // the cancel, else the query can be removed from the queue and never submitted to the driver.

    function cancel (qid, callback) {
      if (workQueue.length() === 0) {
        setImmediate(function () {
          callback(new Error('Error: [msnodesql] cannot cancel query (empty queue) id ' + qid))
        })
        return
      }

      var i = -1

      var first = workQueue.first(function (idx, currentItem) {
        if (currentItem.commandId !== driverCommandEnum.QUERY) {
          return false
        }
        var args = currentItem.args
        var notify = args[0]
        var currentQueryId = notify.getQueryId()
        i = idx
        return qid === currentQueryId
      })

      if (first) {
        execCancel(qid, i, callback)
      } else {
        setImmediate(function () {
          callback(new Error('Error: [msnodesql] cannot cancel query (not found) id ' + qid))
        })
      }
    }

    function objectify (results) {
      var names = {}
      var name
      var idx
      var extra
      var meta
      var candidate

      var lim = results.meta
        ? results.meta.length
        : 0

      for (idx = 0; idx < lim; idx += 1) {
        meta = results.meta[idx]
        name = meta.name
        if (name !== '' && !names[name]) {
          names[name] = idx
        } else {
          extra = 0
          candidate = 'Column' + idx
          while (names[candidate]) {
            candidate = 'Column' + idx + '_' + extra
            extra += 1
          }
          names[candidate] = idx
        }
      }

      var rows = []
      if (results.rows) {
        results.rows.forEach(function (row) {
          var value = {}
          Object.keys(names).forEach(function dispatch (name) {
            if (names.hasOwnProperty(name)) {
              value[name] = row[names[name]]
            }
          })
          rows.push(value)
        })
      }

      return rows
    }

    function freeStatement (queryId, callback) {
      workQueue.enqueue(driverCommandEnum.FREE_STATEMENT, function () {
        cppDriver.freeStatement(queryId, function () {
          callback(queryId)
          workQueue.nextOp()
        })
      }, [])
    }

    function onStatementComplete (queryId, outputParams, callback, results, more) {
      if (!more) {
        freeStatement(queryId, function () {
          if (callback) {
            callback(null, results, more, outputParams)
          }
        })
      } else {
        if (callback) {
          callback(null, results, more, outputParams)
        }
      }
    }

    // for a stored procedure, the out parameters / return value can
    // only be unbound when rest of query completes. The output params
    // will now be ready to fetch out of the statement.

    function beginTransaction (callback) {
      workQueue.enqueue(driverCommandEnum.BEGIN_TRANSACTION, function () {
        cppDriver.beginTransaction(function (err) {
          callback(err)
          workQueue.nextOp()
        })
      }, [])
    }

    function rollback (callback) {
      workQueue.enqueue(driverCommandEnum.ROLLBACK, function () {
        cppDriver.rollback(function onRollback (err) {
          callback(err)
          workQueue.nextOp()
        })
      }, [])
    }

    function commit (callback) {
      workQueue.enqueue(driverCommandEnum.COMMIT, function () {
        cppDriver.commit(function onCommit (err) {
          callback(err)
          workQueue.nextOp()
        })
      }, [])
    }

    function prepare (notify, queryOrObj, callback) {
      workQueue.enqueue(driverCommandEnum.PREPARE, function () {
        cppDriver.prepare(notify.getQueryId(), queryOrObj, function onPrepare (err, meta) {
          callback(err, meta)
          workQueue.nextOp()
        })
      }, [])
    }

    function readAllPrepared (notify, queryObj, params, cb) {
      workQueue.enqueue(driverCommandEnum.QUERY,
        function onReadAllPrepared (notify, query, params, callback) {
          setImmediate(function () {
            reader.fetch(notify, query, params, {
              begin: function preparedInternal (queryId, query, params, callback) {
                cppDriver.bindQuery(queryId, params, function (err, meta) {
                  if (callback) {
                    callback(err, meta)
                  }
                })
              },
              end: function onNextStatement (queryId, outputParams, callback, results, more) {
                if (callback) {
                  callback(null, results, more, outputParams)
                }
              }
            }, callback)
          })
        }, [notify, queryObj, params, cb])
    }

    function readAllQuery (notify, queryObj, params, cb) {
      workQueue.enqueue(driverCommandEnum.QUERY, function onReadAllQuery (notify, query, params, callback) {
        setImmediate(function () {
          reader.fetch(notify, query, params, {
            begin: function queryInternal (queryId, query, params, callback) {
              return cppDriver.query(queryId, query, params, function (err, results, more) {
                if (callback) {
                  callback(err, results, more)
                }
              })
            },
            end: onStatementComplete
          }, callback)
        })
      }, [notify, queryObj, params, cb])
    }

    function realAllProc (notify, queryObj, params, cb) {
      workQueue.enqueue(driverCommandEnum.QUERY,
        function onReadAllProcedure (notify, query, params, callback) {
          setImmediate(function () {
            reader.fetch(notify, query, params, {
              begin: function procedureInternal (queryId, procedure, params, callback) {
                return cppDriver.callProcedure(queryId, procedure, params, function (err, results, params) {
                  if (callback) {
                    callback(err, results, params)
                  }
                })
              },
              end: function procedureUnbindParameters (queryId, outputParams, callback, results, more) {
                workQueue.enqueue(driverCommandEnum.UNBIND, function () {
                  cppDriver.unbind(queryId, function (err, outputVector) {
                    if (err && callback) {
                      callback(err, results)
                    }
                    onStatementComplete(queryId, outputVector, callback, results, more)
                    if (!more) {
                      workQueue.nextOp()
                    }
                  })
                }, [])
              }
            }, callback)
          })
        }, [notify, queryObj, params, cb])
    }

    return {
      setUseUTC: setUseUTC,
      cancel: cancel,
      commit: commit,
      rollback: rollback,
      beginTransaction: beginTransaction,
      prepare: prepare,
      objectify: objectify,
      freeStatement: freeStatement,
      readAllQuery: readAllQuery,
      realAllProc: realAllProc,
      readAllPrepared: readAllPrepared,
      emptyQueue: emptyQueue,
      close: close
    }
  }

  return {
    DriverMgr: DriverMgr
  }
}())

exports.driverModule = driverModule
