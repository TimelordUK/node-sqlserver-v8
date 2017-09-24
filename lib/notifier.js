/**
 * Created by Stephen on 28/06/2017.
 */

'use strict'

var notifyModule = (function () {
  var events = require('events')
  var util = require('util')

  function NotifyFactory () {
    var nextId = 0

    function StreamEvents () {
      var queryId = nextId
      nextId += 1
      var theConn
      var queryObj

      function getQueryObj () {
        return queryObj
      }

      function getQueryId () {
        return queryId
      }

      function setQueryObj (qo) {
        queryObj = qo
      }

      function setConn (c) {
        theConn = c
      }

      function cancelQuery (cb) {
        if (theConn) {
          theConn.cancelQuery(this, cb)
        } else {
          setImmediate(function () {
            cb(new Error('[msnodesql] cannot cancel query where setConn has not been set'))
          })
        }
      }

      this.getQueryObj = getQueryObj
      this.getQueryId = getQueryId
      this.setConn = setConn
      this.setQueryObj = setQueryObj
      this.cancelQuery = cancelQuery

      events.EventEmitter.call(this)
    }

    util.inherits(StreamEvents, events.EventEmitter)

    function getChunkyArgs (paramsOrCallback, callback) {
      if ((typeof paramsOrCallback === 'object' &&
          Array.isArray(paramsOrCallback) === true) &&
        typeof callback === 'function') {
        return {params: paramsOrCallback, callback: callback}
      }

      if (!paramsOrCallback && typeof callback === 'function') {
        return {params: [], callback: callback}
      }

      if (typeof paramsOrCallback === 'function' && callback === undefined) {
        return {params: [], callback: paramsOrCallback}
      }

      if ((typeof paramsOrCallback === 'object' &&
          Array.isArray(paramsOrCallback) === true) &&
        callback === undefined) {
        return {params: paramsOrCallback, callback: null}
      }

      if ((!paramsOrCallback || paramsOrCallback === undefined) &&
        callback === undefined) {
        return {params: [], callback: null}
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
      parameters.forEach(function (p) {
        if (typeof p.value !== p.type) {
          throw new Error(['[msnodesql] Invalid ', p.name, ' passed to function ', funcName, '. Type should be ', p.type, '.'].join(''))
        }
      })
    }

    function validateQuery (queryOrObj, useUTC, parentFn) {
      var queryObj = getQueryObject(queryOrObj, useUTC)
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
      StreamEvents: StreamEvents,
      validateParameters: validateParameters,
      getChunkyArgs: getChunkyArgs,
      validateQuery: validateQuery
    }
  }

  return {
    NotifyFactory: NotifyFactory
  }
}())

exports.notifyModule = notifyModule
