const { utilModule } = require('./util')
const { BasePromises } = require('./base-promises')

class PreparedStatementPromises extends BasePromises {
  async query (params, options) {
    const q = this.prepared.preparedQuery(params)
    return this.aggregator.queryPrepared(q, options)
  }

  async free () {
    return this.op(cb => this.prepared.free(cb))
  }

  constructor (c, ps) {
    super()
    this.aggregator = new utilModule.QueryAggregator(c)
    this.connection = c
    this.prepared = ps
  }
}

class PreparedStatement {
  constructor (notifier, driverMgr, preparedSignature, connection, preparedNotifier, preparedMeta) {
    this.notifier = notifier
    this.driverMgr = driverMgr
    this.connection = connection
    this.meta = preparedMeta.meta
    this.notify = preparedNotifier
    this.handle = preparedMeta.handle
    this.active = true
    this.signature = preparedSignature
    this.promises = new PreparedStatementPromises(connection, this)
    this.errors = null
    preparedNotifier.setStateChangeCallback()
  }

  getMeta () {
    return this.meta
  }

  getSignature () {
    return this.signature
  }

  getId () {
    return this.notify.getQueryId()
  }

  // once freed, the native statement is gone: every use is refused, with no native call
  freedError () {
    const err = new Error(`[msnodesql] prepared statement ${this.getId()} has been freed`)
    err.sqlstate = 'HY010' // function sequence error
    err.code = 0
    return err
  }

  // each execution is submitted ... done. there is no free per execution: 'free' is raised
  // once, by free(), when the native statement is released.
  preparedQuery (paramsOrCallback, callback) {
    const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)
    if (!this.active) {
      // refused as a query is: its error, then done. never submitted, and nothing to free
      const err = this.freedError()
      setImmediate(() => {
        if (chunky.callback) {
          chunky.callback(err, null, false)
        } else if (this.notify.listenerCount('error') > 0) {
          this.notify.emit('error', err, false)
        }
        setImmediate(() => this.notify.emit('done', this.getId()))
      })
      return this.notify
    }

    const onPreparedQuery = (err, results, more) => {
      this.errors = err
      if (chunky.callback) {
        if (err) {
          this.errors = err
          chunky.callback(err)
        } else {
          if (!this.errors) {
            chunky.callback(err, this.driverMgr.objectify(results), more)
          }
        }
      }
    }

    if (chunky.callback) {
      this.driverMgr.readAllPrepared(this.notify, {}, chunky.params, onPreparedQuery)
    } else {
      this.driverMgr.readAllPrepared(this.notify, {}, chunky.params)
    }

    return this.notify
  }

  // releases the native statement, then raises 'free'. inactive at once, so an execution
  // asked for after free() is refused even before the release has happened. a second free
  // is refused in its callback.
  free (callback) {
    if (!this.active) {
      const err = this.freedError()
      setImmediate(() => { if (callback) callback(err, null) })
      return
    }
    this.active = false
    this.driverMgr.freeStatement(this.notify, err => {
      if (callback) {
        callback(err, null)
      }
    })
  }
}

exports.PreparedStatement = PreparedStatement
