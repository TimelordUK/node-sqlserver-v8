'use strict'

class QueryHandler {
  constructor (cppDriver) {
    this.cppDriver = cppDriver
  }

  begin (queryId, query, params, callback) { }
  end (queryId, outputParams, callback, results, more) { }
}

class NativePreparedQueryHandler extends QueryHandler {
  begin (queryId, query, params, callback) {
    this.cppDriver.bindQuery(queryId, params, (err, meta) => {
      if (callback) {
        callback(err, meta)
      }
    })
  }

  end (queryId, outputParams, callback, results, more) {
    if (callback) {
      callback(null, results, more, outputParams)
    }
  }
}

class NativeQueryHandler extends QueryHandler {
  constructor (cppDriver, onStatementComplete) {
    super(cppDriver)
    this.onStatementCompleteHandler = onStatementComplete
  }

  begin (queryId, query, params, callback) {
    this.cppDriver.query(queryId, query, params, (err, results, more) => {
      if (callback) {
        callback(err, results, more)
      }
    })
  }

  end (not, outputParams, callback, results, endMore) {
    this.onStatementCompleteHandler.onStatementComplete(not, outputParams, callback, results, endMore)
  }
}

class NativeProcedureQueryHandler extends QueryHandler {
  constructor (cppDriver, onStatementComplete, workQueue, unbindEnum) {
    super(cppDriver)
    this.onStatementCompleteHandler = onStatementComplete
    this.workQueue = workQueue
    this.unbindEnum = unbindEnum
  }

  begin (queryId, procedure, params, callback) {
    this.cppDriver.callProcedure(queryId, procedure, params, (err, results, params) => {
      if (callback) {
        callback(err, results, params)
      }
    })
  }

  // for a stored procedure with multiple statements, only unbind after all
  // statements are completed

  unbind (more, not, qid, results, callback) {
    this.cppDriver.unbind(qid, (err, outputVector) => {
      if (err && callback) {
        callback(err, results)
      }
      not.emit('output', outputVector)
      this.onStatementCompleteHandler.onStatementComplete(not, outputVector, callback, results, more)
      if (!more) {
        this.workQueue.nextOp()
      }
    })
  }

  end (not, outputParams, callback, results, endMore) {
    if (!endMore) {
      const qid = not.getQueryId()
      this.workQueue.enqueue(this.unbindEnum, (a) =>
        setImmediate(() => this.unbind(a, not, qid, results, callback)), [endMore])
    } else {
      this.onStatementCompleteHandler.onStatementComplete(not, null, callback, results, endMore)
    }
  }
}

exports.NativePreparedQueryHandler = NativePreparedQueryHandler
exports.NativeQueryHandler = NativeQueryHandler
exports.NativeProcedureQueryHandler = NativeProcedureQueryHandler
