var events = require('events');
var util = require('util');

var nextId = 0;

function StreamEvents() {

    var queryId = nextId++;

    function getQueryId() {
        return queryId;
    }

    this.getQueryId = getQueryId;

    events.EventEmitter.call(this);
}
util.inherits(StreamEvents, events.EventEmitter);

function routeStatementError(err, callback, notify) {
    if (callback) {
        callback(err);
    }
    else if (notify && notify.listeners('error').length > 0) {
        notify.emit('error', err);
    }
    else {
        throw new Error(err);
    }
}

function nextOp(q) {

    q.shift();
    if (q.length != 0) {
        var op = q[0];
        op.fn.apply(op.fn, op.args);
    }
}

function validateParameters(parameters, funcName) {

    parameters.forEach(function (p) {
        if (typeof p.value != p.type) {
            throw new Error(["[msnodesql] Invalid ", p.name, " passed to function ", funcName, ". Type should be ", p.type, "."].join(''));
        }
    });
}

function query_internal(native, queryId, query, params, callback) {

    function onQuery(err, results) {
        if (callback) {
            callback(err, results);
        }
    }

    return native.query(queryId, query, params, onQuery);
}

function procedure_internal(native, queryId, procedure, params, callback) {

    function onProc(err, results, params) {
        if (callback) {
            callback(err, results, params);
        }
    }

    return native.callProcedure(queryId, procedure, params, onProc);
}

function getQueryObject(p) {
    return typeof(p) === 'string' ?
    {
        query_str: p,
        query_timeout: 0
    }
        : p;
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

function getChunkyArgs(paramsOrCallback, callback) {

    if (( typeof paramsOrCallback == 'object' && Array.isArray(paramsOrCallback) == true ) &&
        typeof callback == 'function') {

        return {params: paramsOrCallback, callback: callback};
    }

    if (paramsOrCallback == null && typeof callback == 'function') {

        return {params: [], callback: callback};
    }

    if (typeof paramsOrCallback == 'function' && typeof callback == 'undefined') {

        return {params: [], callback: paramsOrCallback};
    }

    if (( typeof paramsOrCallback == 'object' && Array.isArray(paramsOrCallback) == true ) &&
        typeof callback == 'undefined') {

        return {params: paramsOrCallback, callback: null};
    }

    if (( paramsOrCallback == null || typeof paramsOrCallback == 'undefined' ) && typeof callback == 'undefined') {

        return {params: [], callback: null};
    }

    throw new Error("[msnodesql] Invalid parameter(s) passed to function query or queryRaw.");
}

function objectify(results) {

    var names = {};
    var name, idx;

    for (idx in results.meta) {
        var meta = results.meta[idx];
        name = meta.name;
        if (name !== '' && names[name] === undefined) {
            names[name] = idx;
        }
        else {
            var extra = 0;
            var candidate = 'Column' + idx;
            while (names[candidate] !== undefined) {
                candidate = 'Column' + idx + '_' + extra++;
            }
            names[candidate] = idx;
        }
    }

    var rows = [];
    if (results.rows != null) {
        results.rows.forEach(function (row) {
            var value = {};
            for (name in names) {
                if (names.hasOwnProperty(name)) {
                    value[name] = row[names[name]];
                }
            }
            rows.push(value);
        });
    }

    return rows;
}

function callStoredProcedure(q, native, queryOb, paramsOrCallback, callback) {

    validateParameters(
        [
            {
                type : 'string',
                value : queryOb.query_str,
                name : 'query string'
            }
        ], 'callproc');

    var chunky = getChunkyArgs(paramsOrCallback, callback);

    function onProcRaw(err, results, outputParams, more) {
        if (chunky.callback) {
            if (err) chunky.callback(err);
            else chunky.callback(err, objectify(results), more, outputParams);
        }
    }

    var notify = new StreamEvents();
    var op = {
        fn : readall,
        args : [q, notify, native, queryOb, chunky.params, true, onProcRaw]
    };

    q.push(op);
    if (q.length == 1) {
        readall(q, notify, native, queryOb, chunky.params, true, onProcRaw);
    }

    return notify;
}

function readall(q, notify, native, query, params, callable, callback) {

    var meta;
    var column;
    var rows = [];
    var rowindex = 0;
    var outputParams = [];
    var operationId = -1;

    var queryId =  notify.getQueryId();
    
    function onReadColumnMore(err, results) {
        setImmediate(function () {
            queued_onReadColumnMore(err, results);
        })
    }

    function onReadColumn(err, results) {
        setImmediate(function () {
            queued_onReadColumn(err, results);
        })
    }

    function onNextResult(err, nextResultSetInfo) {
        setImmediate(function () {
            queued_onNextResult(err, nextResultSetInfo);
        });
    }

    function onReadRow(err, endOfRows) {
        setImmediate(function () {
            queued_onReadRow(err, endOfRows);
        });
    }

    function queued_onReadColumnMore(err, results) {

        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
            return;
        }

        var data = results.data;
        var more = results.more;

        notify.emit('column', column, data, more);

        if (callback) {
            rows[rows.length - 1][column] += data;
        }

        if (more) {
            native.readColumn(queryId, column, onReadColumnMore);
            return;
        }

        column++;
        if (column >= meta.length) {
            native.readRow(queryId, onReadRow);
            return;
        }

        native.readColumn(queryId, column, onReadColumn);
    }

    function queued_onReadColumn(err, results) {
        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
            return;
        }

        var data = results.data;
        var more = results.more;

        notify.emit('column', column, data, more);

        if (callback) {
            rows[rows.length - 1][column] = data;
        }

        if (more) {
            native.readColumn(queryId, column, onReadColumnMore);
            return;
        }

        column++;

        if (column >= meta.length) {
            native.readRow(queryId, onReadRow);
            return;
        }

        native.readColumn(queryId, column, onReadColumn);
    }

    function rowsCompleted(results, more) {

        if (!more) {
            notify.emit('done');
        }

        if (operationId > 0) {
            outputParams = native.unbind(queryId, operationId);
        }

        if (callback) {
            callback(null, results, more, outputParams);
        }

        if (!more) {
            freeStatement(q, native, queryId, function() {

            });
        }
    }

    function rowsAffected(nextResultSetInfo) {

        var rowCount = nextResultSetInfo.rowCount;
        var preRowCount = nextResultSetInfo.preRowCount;
        var moreResults = !nextResultSetInfo.endOfResults;
        notify.emit('rowcount', preRowCount);

        var state = {
            meta: null,
            rowcount: rowCount
        };

        rowsCompleted(state, moreResults);
    }

    function queued_onNextResult(err, nextResultSetInfo) {
        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
            return;
        }

        // handle the just finished result reading
        if (meta.length == 0) {
            // if there was no metadata, then pass the row count (rows affected)
            rowsAffected(nextResultSetInfo);
        }
        else {
            // otherwise, pass the accumulated results
            rowsCompleted({meta: meta, rows: rows}, !nextResultSetInfo.endOfResults);
        }

        // reset for the next resultset
        meta = nextResultSetInfo.meta;
        rows = [];

        if (nextResultSetInfo.endOfResults) {
            // TODO: What about closed connections due to more being false in the callback?  See queryRaw below.
            nextOp(q);
        }
        else {

            // if this is just a set of rows
            if (meta.length > 0) {
                notify.emit('meta', meta);
                // kick off reading next set of rows
                native.readRow(queryId, onReadRow);
            }
            else {
                native.nextResult(queryId, onNextResult);
            }
        }
    }

    function queued_onReadRow(err, endOfRows) {
        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
        }
        // if there were rows and we haven't reached the end yet (like EOF)
        else if (meta.length > 0 && !endOfRows) {

            notify.emit('row', rowindex++);

            column = 0;
            if (callback) {
                rows[rows.length] = [];
            }

            native.readColumn(queryId, column, onReadColumn);
        }
        // otherwise, go to the next result set
        else {
            native.nextResult(queryId, onNextResult);
        }
    }

    var invoke = callable ? procedure_internal : query_internal;

    function onInvoke(err, results, params) {

        outputParams = params;

        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
            return;
        }

        meta = results;
        if (meta.length > 0) {
            notify.emit('meta', meta);
            native.readRow(queryId, onReadRow);
        }
        else {
            native.nextResult(queryId, onNextResult)
        }
    }

    operationId = invoke(native, queryId, query, params, onInvoke);
}

function freeStatement(q, native, queryId, callback) {

    function onFree() {
        callback(queryId);
        nextOp(q);
    }

    var freeop = {
        fn: function (cb) {
            native.freeStatement(queryId, cb);
        }, args: [onFree]
    };
    q.push(freeop);
    if (q.length == 1) {
        nextOp(q);
    }
}

exports.validateQuery = validateQuery;
exports.validateParameters = validateParameters;
exports.routeStatementError = routeStatementError;
exports.nextOp = nextOp;
exports.getChunkyArgs = getChunkyArgs;
exports.objectify = objectify;
exports.StreamEvents = StreamEvents;
exports.readall = readall;
exports.callStoredProcedure = callStoredProcedure;