/**
 * Created by Stephen on 28/06/2017.
 */
var events = require('events');
var util = require('util');

function NotifyFactory() {

    var nextId = 0;

    function StreamEvents() {

        var queryId = nextId++;
        var theConn;
        var queryObj;

        function getQueryObj() {
            return queryObj;
        }

        function getQueryId() {
            return queryId;
        }

        function setQueryObj(qo) {
            queryObj = qo;
        }

        function setConn(c) {
            theConn = c;
        }

        function cancelQuery(cb) {
            if (theConn) {
                theConn.cancelQuery(this, cb);
            }else {
                setImmediate(function() {
                    cb(new Error("[msnodesql] cannot cancel query where setConn has not been set"));
                });
            }
        }

        this.getQueryObj = getQueryObj;
        this.getQueryId = getQueryId;
        this.setConn = setConn;
        this.setQueryObj = setQueryObj;
        this.cancelQuery = cancelQuery;

        events.EventEmitter.call(this);
    }

    util.inherits(StreamEvents, events.EventEmitter);

    function getChunkyArgs(paramsOrCallback, callback) {

        if (( typeof paramsOrCallback === 'object' && Array.isArray(paramsOrCallback) === true ) &&
            typeof callback === 'function') {

            return {params: paramsOrCallback, callback: callback};
        }

        if (!paramsOrCallback && typeof callback === 'function') {

            return {params: [], callback: callback};
        }

        if (typeof paramsOrCallback === 'function' && typeof callback === 'undefined') {

            return {params: [], callback: paramsOrCallback};
        }

        if (( typeof paramsOrCallback === 'object' && Array.isArray(paramsOrCallback) === true ) &&
            typeof callback === 'undefined') {

            return {params: paramsOrCallback, callback: null};
        }

        if (( !paramsOrCallback || typeof paramsOrCallback === 'undefined' ) && typeof callback === 'undefined') {

            return {params: [], callback: null};
        }

        throw new Error("[msnodesql] Invalid parameter(s) passed to function query or queryRaw.");
    }

    function getQueryObject(p) {
        return typeof(p) === 'string' ?
            {
                query_str: p,
                query_timeout: 0,
                query_polling:false,
                query_tz_adjustment: 0 // leave the driver unmapped and translate back in js.
            }
            : p;
    }

    function validateParameters(parameters, funcName) {

        parameters.forEach(function (p) {
            if (typeof p.value != p.type) {
                throw new Error(["[msnodesql] Invalid ", p.name, " passed to function ", funcName, ". Type should be ", p.type, "."].join(''));
            }
        });
    }

    function validateQuery(queryOrObj, parentFn) {
        var queryObj = getQueryObject(queryOrObj);
        validateParameters(
            [
                {
                    type: 'string',
                    value: queryObj.query_str,
                    name: 'query string'
                }
            ], parentFn);
        return queryObj;
    }

    var public_api = {
        StreamEvents : StreamEvents,
        validateParameters :  validateParameters,
        getChunkyArgs : getChunkyArgs,
        validateQuery : validateQuery
    };

    return public_api;
}

exports.NotifyFactory = NotifyFactory;
