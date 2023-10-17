/**
 * Created by Stephen on 28/06/2017.
 */

'use strict'

const notifyModule = ((() => {
  const { EventEmitter } = require('stream')
  class QueryObject {
    constructor (p, to, po) {
      this.query_str = p
      this.query_timeout = to || 0
      this.query_polling = po || false
      this.query_tz_adjustment = 0
    }
  }

  class LexicalParam {
    constructor (type, value, name) {
      this.type = type
      this.value = value
      this.name = name
    }
  }

  class ChunkyArgs {
    constructor (params, callback) {
      this.params = params
      this.callback = callback || null
    }
  }

  class StreamEventsPromises {
    constructor (se) {
      this.se = se
    }

    async cancel (timeout) {
      timeout = timeout || 5000
      const q = this.se
      let err
      return new Promise((resolve, reject) => {
        const h = setTimeout(() => {
          reject(new Error('failed to cancel'))
        }, timeout)
        try {
          q.on('free', () => {
            err = err || new Error('Operation canceled')
            resolve(err)
            clearTimeout(h)
          })
          q.on('error', (e) => {
            err = e
            if (!e.message.includes('canceled')) {
              clearTimeout(h)
              reject(e)
            } else {
              err = e
            }
          })
          q.pauseQuery()
          setImmediate(() => {
            q.cancelQuery()
          })
        } catch (e) {
          reject(e)
        }
      })
    }
  }

  class StreamEvents extends EventEmitter {
    constructor () {
      super()
      this.queryId = 0
      this.theConnection = null
      this.queryObj = null
      this.queryWorker = null
      this.operation = null
      this.paused = null
      this.prepared = null
      this.promises = new StreamEventsPromises(this)
    }

    isPaused () {
      return this.paused
    }

    setPrepared () {
      this.prepared = true
    }

    isPrepared () {
      return this.prepared
    }

    getQueryObj () {
      return this.queryObj
    }

    getQueryId () {
      return this.queryId
    }

    setQueryId (qid) {
      this.queryId = qid
    }

    setOperation (id) {
      this.operation = id
    }

    getOperation () {
      return this.operation
    }

    setQueryObj (qo) {
      this.queryObj = qo
    }

    setConn (c) {
      this.theConnection = c
    }

    setQueryWorker (qw) {
      this.queryWorker = qw
      if (this.paused) {
        this.queryWorker.pause()
      }
    }

    cancelQuery (cb) {
      if (this.theConnection) {
        this.theConnection.cancelQuery(this, cb)
      } else {
        setImmediate(() => {
          cb(new Error('[msnodesql] cannot cancel query where setConn has not been set'))
        })
      }
    }

    pauseQuery () {
      this.paused = true
      if (this.queryWorker) {
        this.queryWorker.pause()
      }
    }

    resumeQuery () {
      this.paused = false
      if (this.queryWorker) {
        this.queryWorker.resume()
      }
    }
  }

  class NotifyFactory {
    constructor () {
      this.StreamEvents = StreamEvents
      this.LexicalParam = LexicalParam
      this.QueryObject = QueryObject
    }

    getChunkyArgs (paramsOrCallback, callback) {
      if ((typeof paramsOrCallback === 'object' &&
          Array.isArray(paramsOrCallback)) &&
        typeof callback === 'function') {
        return new ChunkyArgs(paramsOrCallback, callback)
      }

      if (!paramsOrCallback && typeof callback === 'function') {
        return new ChunkyArgs([], callback)
      }

      if (typeof paramsOrCallback === 'function' && callback === undefined) {
        return new ChunkyArgs([], paramsOrCallback)
      }

      if ((typeof paramsOrCallback === 'object' &&
          Array.isArray(paramsOrCallback)) &&
        callback === undefined) {
        return new ChunkyArgs(paramsOrCallback, null)
      }

      if ((!paramsOrCallback) &&
        callback === undefined) {
        return new ChunkyArgs([], null)
      }

      throw new Error('[msnodesql] Invalid parameter(s) passed to function query or queryRaw.')
    }

    getQueryObject (p) {
      return typeof (p) === 'string'
        ? new QueryObject(p)
        : p
    }

    validateParameters (parameters, funcName) {
      parameters.forEach(p => {
        if (typeof p.value !== p.type) {
          throw new Error(['[msnodesql] Invalid ', p.name, ' passed to function ', funcName, '. Type should be ', p.type, '.'].join(''))
        }
      })
    }

    validateQuery (queryOrObj, useUTC, parentFn) {
      const queryObj = this.getQueryObject(queryOrObj, useUTC)
      this.validateParameters(
        [
          new LexicalParam('string', queryObj.query_str, 'query string')
        ],
        parentFn
      )
      return queryObj
    }
  }

  return {
    NotifyFactory,
    StreamEvents,
    LexicalParam
  }
})())

exports.notifyModule = notifyModule
