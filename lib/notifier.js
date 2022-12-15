/**
 * Created by Stephen on 28/06/2017.
 */

'use strict'

const notifyModule = ((() => {
  const events = require('events')
  const { EventEmitter } = require('stream')

  function NotifyFactory () {
    class StreamEventsPromises {
      constructor (se) {
        this.se = se
      }

      cancel (timeout) {
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
        let queryId = 0
        let theConnection
        let queryObj
        let queryWorker
        let operation
        let paused
        let prepared

        function isPaused () {
          return paused
        }

        function setPrepared () {
          prepared = true
        }

        function isPrepared () {
          return prepared
        }

        function getQueryObj () {
          return queryObj
        }

        function getQueryId () {
          return queryId
        }

        function setQueryId (qid) {
          queryId = qid
        }

        function setOperation (id) {
          operation = id
        }

        function getOperation () {
          return operation
        }

        function setQueryObj (qo) {
          queryObj = qo
        }

        function setConn (c) {
          theConnection = c
        }

        function setQueryWorker (qw) {
          queryWorker = qw
          if (paused) {
            queryWorker.pause()
          }
        }

        function cancelQuery (cb) {
          if (theConnection) {
            theConnection.cancelQuery(this, cb)
          } else {
            setImmediate(() => {
              cb(new Error('[msnodesql] cannot cancel query where setConn has not been set'))
            })
          }
        }

        function pauseQuery () {
          paused = true
          if (queryWorker) {
            queryWorker.pause()
          }
        }

        function resumeQuery () {
          paused = false
          if (queryWorker) {
            queryWorker.resume()
          }
        }

        this.setOperation = setOperation
        this.getOperation = getOperation
        this.getQueryObj = getQueryObj
        this.getQueryId = getQueryId
        this.setQueryId = setQueryId
        this.setConn = setConn
        this.setQueryObj = setQueryObj
        this.cancelQuery = cancelQuery
        this.pauseQuery = pauseQuery
        this.resumeQuery = resumeQuery
        this.setQueryWorker = setQueryWorker
        this.isPaused = isPaused
        this.isPrepared = isPrepared
        this.setPrepared = setPrepared
        this.promises = new StreamEventsPromises(this)

        events.EventEmitter.call(this)
      }
    }

    function getChunkyArgs (paramsOrCallback, callback) {
      if ((typeof paramsOrCallback === 'object' &&
        Array.isArray(paramsOrCallback) === true) &&
        typeof callback === 'function') {
        return { params: paramsOrCallback, callback }
      }

      if (!paramsOrCallback && typeof callback === 'function') {
        return { params: [], callback }
      }

      if (typeof paramsOrCallback === 'function' && callback === undefined) {
        return { params: [], callback: paramsOrCallback }
      }

      if ((typeof paramsOrCallback === 'object' &&
        Array.isArray(paramsOrCallback) === true) &&
        callback === undefined) {
        return { params: paramsOrCallback, callback: null }
      }

      if ((!paramsOrCallback) &&
        callback === undefined) {
        return { params: [], callback: null }
      }

      throw new Error('[msnodesql] Invalid parameter(s) passed to function query or queryRaw.')
    }

    function getQueryObject (p) {
      return typeof (p) === 'string'
        ? {
            query_str: p,
            query_timeout: 0,
            query_polling: false,
            query_tz_adjustment: 0
          }
        : p
    }

    function validateParameters (parameters, funcName) {
      parameters.forEach(p => {
        if (typeof p.value !== p.type) {
          throw new Error(['[msnodesql] Invalid ', p.name, ' passed to function ', funcName, '. Type should be ', p.type, '.'].join(''))
        }
      })
    }

    function validateQuery (queryOrObj, useUTC, parentFn) {
      const queryObj = getQueryObject(queryOrObj, useUTC)
      validateParameters(
        [
          {
            type: 'string',
            value: queryObj.query_str,
            name: 'query string'
          }
        ],
        parentFn
      )
      return queryObj
    }

    return {
      StreamEvents,
      validateParameters,
      getChunkyArgs,
      validateQuery
    }
  }

  return {
    NotifyFactory
  }
})())

exports.notifyModule = notifyModule
