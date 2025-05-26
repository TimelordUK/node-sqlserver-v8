/* global: bindQuery */

'use strict'

const driverModule = ((() => {
  const queueModule = require('./queue').queueModule
  const { DriverRead } = require('./reader')
  const { NativePreparedQueryHandler, NativeQueryHandler, NativeProcedureQueryHandler } = require('./query-handler')

  const driverCommandEnum = {
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

  class DriverMgr {
    constructor (sql) {
      this.cppDriver = sql
      this.workQueue = new queueModule.WorkQueue()
      this.reader = new DriverRead(this.cppDriver, this.workQueue)
    }

    setUseUTC (utc) {
      this.reader.setUseUTC(utc)
    }

    emptyQueue () {
      this.workQueue.emptyQueue()
    }

    close (callback) {
      this.workQueue.enqueue(driverCommandEnum.CLOSE, () => {
        this.cppDriver.close(() => {
          callback()
        })
      }, [])
    }

    forwardCancel (err, callback) {
      setImmediate(() => {
        if (err && err.length > 0) {
          callback(err[0])
        } else {
          callback(null)
        }
      })
    }

    execCancel (qid, queueItem, callback) {
      // send cancel directly to driver.
      const args = queueItem.args
      const cb = args[3]
      const peek = this.workQueue.peek()

      if (queueItem.operationId === peek.operationId) {
        this.cppDriver.pollingMode(qid, true, () => {
          this.cppDriver.cancelQuery(qid, (e) => {
            this.forwardCancel(e, callback)
          })
        })
      } else {
        this.workQueue.dropItem(queueItem)
        setImmediate(() => {
          // make a callback on the cancel request with no error.
          callback(null)
          // invoke the listener as if this has come from driver so user query callback can be invoked.
          if (cb) cb(new Error('Error: [msnodesql] (query removed from q) Operation canceled'))
        })
      }
      return true
    }

    // if this relates to the active query being executed then immediately send
    // the cancel, else the query can be removed from the queue and never submitted to the driver.

    cancelSelector (qid, currentItem) {
      if (currentItem.commandType !== driverCommandEnum.QUERY) {
        return false
      }
      const args = currentItem.args
      const not = args[0]
      const currentQueryId = not.getQueryId()
      return qid === currentQueryId
    }

    drop (qid, first, notify, callback) {
      if (first.paused) {
        this.execCancel(qid, first, () => {
          this.freeStatement(notify, () => {
            this.workQueue.dropItem(first)
            callback(null)
          })
        })
      } else {
        this.execCancel(qid, first, callback)
      }
    }

    cancel (notify, callback) {
      const qid = notify.getQueryId()
      if (this.workQueue.length() === 0) {
        setImmediate(() => {
          callback(new Error(`Error: [msnodesql] cannot cancel query (empty queue) id ${qid}`))
        })
        return
      }

      const first = this.workQueue.first(
        (_idx, currentItem) => this.cancelSelector(qid, currentItem))
      if (first) {
        this.drop(qid, first, notify, callback)
      } else {
        setImmediate(() => {
          callback(new Error(`Error: [msnodesql] cannot cancel query (not found) id ${qid}`))
        })
      }
    }

    getNames (results) {
      const names = []
      const lim = results.meta
        ? results.meta.length
        : 0
      for (let idx = 0; idx < lim; idx += 1) {
        const meta = results.meta[idx]
        const name = meta.name
        if (name !== '' && !names[name]) {
          names[name] = idx
        } else {
          let extra = 0
          let candidate = `Column${idx}`
          while (names[candidate]) {
            candidate = `Column${idx}_${extra}`
            extra += 1
          }
          names[candidate] = idx
        }
      }
      return names
    }

    rowAsObject (names, row) {
      const value = {}
      Object.keys(names).forEach(name => {
        if (Object.prototype.hasOwnProperty.call(names, name)) {
          value[name] = row[names[name]]
        }
      })
      return value
    }

    objectify (results) {
      const names = this.getNames(results)
      return results.rows
        ? results.rows.map(r => this.rowAsObject(names, r))
        : []
    }

    raiseFree (queryId, notify, callback) {
      setImmediate(() => {
        callback(null, queryId)
        setImmediate(() => {
          notify.emit('free', queryId)
          this.workQueue.nextOp()
        })
      })
    }

    freeStatement (notify, callback) {
      const queryId = notify.getQueryId()
      if (queryId >= 0) {
        this.workQueue.enqueue(driverCommandEnum.FREE_STATEMENT, () => {
          this.cppDriver.freeStatement(queryId,
            () => { this.raiseFree(queryId, notify, callback) })
        }, [])
      } else {
        this.raiseFree(queryId, notify, callback)
      }
    }

    onStatementComplete (notify, outputParams, callback, results, more) {
      if (!more) {
        this.freeStatement(notify, () => {
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

    next (callback, err) {
      setImmediate(() => {
        callback(err || null, false)
        setImmediate(() => {
          this.workQueue.nextOp()
        })
      })
    }

    beginTransaction (callback) {
      this.workQueue.enqueue(driverCommandEnum.BEGIN_TRANSACTION, () => {
        this.cppDriver.beginTransaction(err => { this.next(callback, err) })
      }, [])
    }

    rollback (callback) {
      this.workQueue.enqueue(driverCommandEnum.ROLLBACK, () => {
        this.cppDriver.rollback(err => { this.next(callback, err) })
      }, [])
    }

    commit (callback) {
      this.workQueue.enqueue(driverCommandEnum.COMMIT, () => {
        this.cppDriver.commit(err => { this.next(callback, err) })
      }, [])
    }

    prepare (notify, queryOrObj, callback) {
      this.workQueue.enqueue(driverCommandEnum.PREPARE, () => {
        this.cppDriver.prepare(notify.getQueryId(), queryOrObj, (err, meta) => {
          callback(err, meta)
          this.workQueue.nextOp()
        })
      }, [])
    }

    readOperation (notify, queryObj, params, factory, cb) {
      notify.setOperation(this.workQueue.enqueue(driverCommandEnum.QUERY,
        (notify, query, params, callback) => {
          setImmediate(() => {
            const q = this.reader.getQuery(notify, query, params, factory(), callback)
            notify.setQueryWorker(q)
            q.begin()
          })
        }, [notify, queryObj, params, cb]))
    }

    readAllPrepared (notify, queryObj, params, cb) {
      this.readOperation(notify, queryObj, params,
        () => new NativePreparedQueryHandler(this.cppDriver), cb)
    }

    readAllProc (notify, queryObj, params, cb) {
      this.readOperation(notify, queryObj, params,
        () => new NativeProcedureQueryHandler(this.cppDriver, this, this.workQueue, driverCommandEnum.UNBIND), cb)
    }

    read (notify, queryObj, params, cb) {
      this.readOperation(notify, queryObj, params,
        () => new NativeQueryHandler(this.cppDriver, this), cb)
    }

    headPaused (notify, queryObj, params, cb) {
      const peek = this.workQueue.peek()
      const paused = peek?.paused
      if (paused) {
        const pausedNotify = peek.args[0]
        this.freeStatement(pausedNotify, () => {
          this.workQueue.dropItem(peek)
          this.read(notify, queryObj, params, cb)
        })
      }
      return paused
    }

    readAllQuery (notify, queryObj, params, cb) {
      // if paused at head of q then kill this statement to allow driver to set up this one
      if (!this.headPaused(notify, queryObj, params, cb)) {
        this.read(notify, queryObj, params, cb)
      }
    }
  }

  return {
    DriverMgr
  }
})())

exports.driverModule = driverModule
