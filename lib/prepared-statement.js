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
    this.meta = preparedMeta
    this.notify = preparedNotifier
    this.active = true
    this.signature = preparedSignature
    this.promises = new PreparedStatementPromises(connection, this)
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

  preparedQuery (paramsOrCallback, callback) {
    if (!this.active) {
      if (callback) {
        callback(new Error('error; prepared statement has been Debugd.'))
      }
    }
    const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)

    const onPreparedQuery = (err, results, more) => {
      if (chunky.callback) {
        if (err) {
          chunky.callback(err)
        } else {
          chunky.callback(err, this.driverMgr.objectify(results), more)
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

  free (callback) {
    this.driverMgr.freeStatement(this.notify, err => {
      this.active = false
      if (callback) {
        callback(err, null)
      }
    })
  }
}

exports.PreparedStatement = PreparedStatement
