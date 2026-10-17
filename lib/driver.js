/* global: bindQuery */

'use strict'

const driverModule = ((() => {
  const queueModule = require('./queue').queueModule
  const { DriverRead } = require('./reader')
  const { NativePreparedQueryHandler, NativeQueryHandler, NativeProcedureQueryHandler } = require('./query-handler')
  const { logger } = require('./logger')
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
    constructor (sql, version) {
      this.cppDriver = sql
      this.workQueue = new queueModule.WorkQueue()
      this.reader = new DriverRead(this.cppDriver, this.workQueue, version)
      this.version = version
    }

    setUseUTC (utc) {
      this.reader.setUseUTC(utc)
    }

    emptyQueue () {
      this.workQueue.emptyQueue()
    }

    close (callback) {
      // a paused query holds the connection, and would hold it forever: cancel it, so it
      // ends as cancelled and frees its statement before the close runs.
      const head = this.workQueue.peek()
      if (head?.paused && head.commandType === driverCommandEnum.QUERY) {
        logger.debugLazy(() => 'close: cancel the paused query at the head of the queue', 'DriverMgr.close')
        this.cancel(head.args[0], () => {})
      }
      this.workQueue.enqueue(driverCommandEnum.CLOSE, () => {
        logger.debugLazy(() => 'cppDriver.close ', 'DriverMgr.close')
        this.cppDriver.close(() => {
          callback()
        })
      }, [])
    }

    forwardCancel (err, callback) {
      logger.debugLazy(() => `forwardCancel called with err: ${err ? JSON.stringify(err) : 'null'}`, 'DriverMgr.forwardCancel')
      setImmediate(() => {
        if (err && err.length > 0) {
          logger.debugLazy(() => `forwardCancel returning error: ${err[0]}`, 'DriverMgr.forwardCancel')
          callback(err[0])
        } else {
          logger.debugLazy(() => 'forwardCancel completed successfully', 'DriverMgr.forwardCancel')
          callback(null)
        }
      })
    }

    execCancel (notify, queueItem, callback) {
      // send cancel directly to driver.
      const args = queueItem.args
      const cb = args[3]
      const peek = this.workQueue.peek()
      const qid = notify.getQueryId()
      const handle = notify.getHandle()

      if (queueItem === peek) {
        logger.debugLazy(() => `send ${queueItem.operationId} cancel to the driver`)
        this.cppDriver.cancelQuery(qid, handle, (e) => {
          this.forwardCancel(e, callback)
        })
      } else {
        logger.debugLazy(() => `dropping ${queueItem.operationId} queued query (cancel)`)
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
      logger.debugLazy(() => `drop called for query id ${qid}, paused: ${first.paused}`, 'DriverMgr.drop')
      if (first.paused) {
        // a paused query still owns its statement and the head of the queue. cancel the
        // native statement, then the reader ends the query as cancelled and frees the
        // statement as any other query does.
        logger.debugLazy(() => `cancel paused query id ${qid}`, 'DriverMgr.drop')
        this.execCancel(notify, first, (e) => {
          callback(e)
          if (!e && notify.queryWorker) notify.queryWorker.cancelPaused()
        })
      } else {
        logger.debugLazy(() => `executing cancel for active query id ${qid}`, 'DriverMgr.drop')
        this.execCancel(notify, first, callback)
      }
    }

    cancel (notify, callback) {
      const qid = notify.getQueryId()
      logger.debugLazy(() => `cancel request for query id ${qid}`, 'DriverMgr.cancel')

      if (this.workQueue.length() === 0) {
        logger.debugLazy(() => `cancel failed - work queue is empty for query id ${qid}`, 'DriverMgr.cancel')
        setImmediate(() => {
          callback(new Error(`Error: [msnodesql] cannot cancel query (empty queue) id ${qid}`))
        })
        return
      }

      logger.debugLazy(() => `searching for query id ${qid} in work queue of size ${this.workQueue.length()}`, 'DriverMgr.cancel')
      const first = this.workQueue.first(
        (_idx, currentItem) => this.cancelSelector(qid, currentItem))
      if (first) {
        logger.debugLazy(() => `found query id ${qid}, proceeding with cancel`, 'DriverMgr.cancel')
        this.drop(qid, first, notify, callback)
      } else {
        logger.debugLazy(() => `cancel failed - query id ${qid} not found in work queue`, 'DriverMgr.cancel')
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

    // op: the free statement's own queue item, finished once 'free' is raised (none
    // when there was no statement to free)
    raiseFree (queryId, notify, callback, op) {
      setImmediate(() => {
        callback(null, queryId)
        setImmediate(() => {
          notify.emit('free', queryId)
          this.workQueue.finish(op)
        })
      })
    }

    freeStatement (notify, callback) {
      const handle = notify.getHandle()
      const queryId = notify.getQueryId()
      if (handle) {
        const op = this.workQueue.enqueueFollowUp(driverCommandEnum.FREE_STATEMENT, () => {
          logger.debugLazy(() => `free statement ${queryId}`, 'DriverMgr.freeStatement')
          this.cppDriver.releaseStatement(queryId, handle,
            () => {
              logger.debugLazy(() => `statement ${queryId} free - raise event`, 'DriverMgr.freeStatement')
              this.raiseFree(queryId, notify, callback, op)
            })
        }, [])
      } else {
        this.raiseFree(queryId, notify, callback, null)
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

    next (callback, err, op) {
      setImmediate(() => {
        callback(err || null, false)
        setImmediate(() => {
          this.workQueue.finish(op)
        })
      })
    }

    // the native calls below always complete asynchronously, so op is assigned by then
    beginTransaction (callback) {
      const op = this.workQueue.enqueue(driverCommandEnum.BEGIN_TRANSACTION, () => {
        this.cppDriver.beginTransaction(err => { this.next(callback, err, op) })
      }, [])
    }

    rollback (callback) {
      const op = this.workQueue.enqueue(driverCommandEnum.ROLLBACK, () => {
        this.cppDriver.rollback(err => { this.next(callback, err, op) })
      }, [])
    }

    commit (callback) {
      const op = this.workQueue.enqueue(driverCommandEnum.COMMIT, () => {
        this.cppDriver.commit(err => { this.next(callback, err, op) })
      }, [])
    }

    prepare (notify, queryOrObj, callback) {
      const op = this.workQueue.enqueue(driverCommandEnum.PREPARE, () => {
        this.cppDriver.prepare(notify.getQueryId(), queryOrObj, (err, meta) => {
          callback(err, meta)
          this.workQueue.finish(op)
        })
      }, [])
    }

    // the query keeps its own queue item: a prepared statement shares one notify across
    // its executions, so the notify's operation is only ever the latest one queued
    readOperation (notify, queryObj, params, factory, cb) {
      const op = this.workQueue.enqueue(driverCommandEnum.QUERY,
        (notify, query, params, callback) => {
          setImmediate(() => {
            const q = this.reader.getQuery(notify, query, params, factory(), callback, op)
            notify.setQueryWorker(q)
            q.begin()
          })
        }, [notify, queryObj, params, cb])
      notify.setOperation(op)
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

    // a paused query holds the connection: a new query waits behind it like any other
    readAllQuery (notify, queryObj, params, cb) {
      this.read(notify, queryObj, params, cb)
    }
  }

  return {
    DriverMgr
  }
})())

exports.driverModule = driverModule
