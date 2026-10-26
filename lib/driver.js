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
        const notify = head.args[0]
        this.cancel(notify, (e) => {
          // a refused cancel leaves the query paused, and the close would wait for it
          // forever: the connection is closing, so the query ends as cancelled all the same
          if (e && head.paused) {
            this.workQueue.resume(head)
            if (notify.queryWorker) notify.queryWorker.cancelPaused()
          }
        })
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
        this.cppDriver.cancelQuery(qid, handle, (e, accepted) => {
          // the driver can refuse, e.g. a non polling statement that is not executing or
          // reading: there is nothing to cancel, so the cancel fails and the query goes on
          if (!e && accepted === false) {
            e = [new Error(`Error: [msnodesql] cannot cancel query (refused by the driver) id ${qid}`)]
          }
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
      // a paused query still owns its statement and the head of the queue. a query can
      // also be paused after its cancel was sent, while rows already fetched are still
      // emitted, before the cancel's callback or after it. either way, once the cancel is
      // accepted the reader ends the query as cancelled and frees the statement as any
      // other query does: a pause no longer holds it.
      this.execCancel(notify, first, (e) => {
        // once cancelled the query is ending, and no longer holds the connection: work
        // submitted from the cancel callback queues behind it
        if (!e) this.workQueue.resume(first)
        callback(e)
        if (!e && notify.queryWorker) notify.queryWorker.cancelPaused()
      })
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
    // 'free' never comes before the query's 'done', and the queue moves on only after both
    raiseFree (queryId, notify, callback, op) {
      setImmediate(() => {
        callback(null, queryId)
        setImmediate(() => {
          const free = () => {
            notify.emit('free', queryId)
            this.workQueue.finish(op)
          }
          const worker = notify.queryWorker
          if (worker && worker.afterDone) {
            worker.afterDone(free)
          } else {
            free()
          }
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
    // a paused query holds the connection: new work is refused until it is resumed and
    // finished, or cancelled. work queued before the pause still waits its turn.
    pausedQuery () {
      const head = this.workQueue.peek()
      return head?.paused && head.commandType === driverCommandEnum.QUERY ? head : null
    }

    pausedError (head) {
      const qid = head.args[0].getQueryId()
      const err = new Error(`[msnodesql] query ${qid} on this connection is paused - resume or cancel it before submitting more work`)
      err.sqlstate = 'HY010' // function sequence error
      err.code = 0
      return err
    }

    // true when refused: callback gets the error
    refuseWhilePaused (callback) {
      const head = this.pausedQuery()
      if (!head) return false
      const err = this.pausedError(head)
      setImmediate(() => callback(err))
      return true
    }

    // a refused query ends as any failed query does: the error, then done and free.
    // it was never submitted, so there is no 'submitted'.
    refuseQueryWhilePaused (notify, cb) {
      const head = this.pausedQuery()
      if (!head) return false
      const err = this.pausedError(head)
      logger.debugLazy(() => `refuse query ${notify.getQueryId()}: ${err.message}`, 'DriverMgr.refuseQueryWhilePaused')
      setImmediate(() => {
        if (cb) {
          cb(err, null, false)
        } else if (notify.listenerCount('error') > 0) {
          notify.emit('error', err, false)
        }
        // a tick on: the connection defers the user's callback by one
        setImmediate(() => {
          notify.emit('done', notify.getQueryId())
          notify.emit('free', notify.getQueryId())
        })
      })
      return true
    }

    beginTransaction (callback) {
      if (this.refuseWhilePaused(callback)) return
      const op = this.workQueue.enqueue(driverCommandEnum.BEGIN_TRANSACTION, () => {
        this.cppDriver.beginTransaction(err => { this.next(callback, err, op) })
      }, [])
    }

    rollback (callback) {
      if (this.refuseWhilePaused(callback)) return
      const op = this.workQueue.enqueue(driverCommandEnum.ROLLBACK, () => {
        this.cppDriver.rollback(err => { this.next(callback, err, op) })
      }, [])
    }

    commit (callback) {
      if (this.refuseWhilePaused(callback)) return
      const op = this.workQueue.enqueue(driverCommandEnum.COMMIT, () => {
        this.cppDriver.commit(err => { this.next(callback, err, op) })
      }, [])
    }

    prepare (notify, queryOrObj, callback) {
      if (this.refuseWhilePaused(callback)) return
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
      if (this.refuseQueryWhilePaused(notify, cb)) return
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

    readAllQuery (notify, queryObj, params, cb) {
      this.read(notify, queryObj, params, cb)
    }
  }

  return {
    DriverMgr
  }
})())

exports.driverModule = driverModule
