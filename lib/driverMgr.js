var events = require('events');
var util = require('util');

function StreamEvents() {
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

function query_internal(native, query, params, callback) {

    function onQuery(err, results) {

        if (callback) {
            callback(err, results);
        }
    }

    return native.query(query, params, onQuery);
}

function procedure_internal(native, procedure, params, callback) {

    function onProc(err, results, params) {

        if (callback) {
            callback(err, results, params);
        }
    }

    return native.callProcedure(procedure, params, onProc);
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
    for (idx in results.rows) {
        var row = results.rows[idx];
        var value = {};
        for (name in names) {
            value[name] = row[names[name]];
        }
        rows.push(value);
    }

    return rows;
}

function readall(q, notify, native, query, params, callable, callback) {

    var meta;
    var column;
    var rows = [];
    var rowindex = 0;
    var outputParams = [];
    var id = -1;

    function onReadColumnMore(err, results) {
        setImmediate(function() {
            queued_onReadColumnMore(err, results);
        })
    }

    function onReadColumn(err, results) {
        setImmediate(function() {
            queued_onReadColumn(err, results);
        })
    }

    function onNextResult(err, nextResultSetInfo) {
        setImmediate(function() {
            queued_onNextResult(err, nextResultSetInfo);
        });
    }

    function onReadRow(err, endOfRows) {
        setImmediate(function() {
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
            native.readColumn(column, onReadColumnMore);
            return;
        }

        column++;
        if (column >= meta.length) {
            native.readRow(onReadRow);
            return;
        }

        native.readColumn(column, onReadColumn);
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
            native.readColumn(column, onReadColumnMore);
            return;
        }

        column++;

        if (column >= meta.length) {
            native.readRow(onReadRow);
            return;
        }

        native.readColumn(column, onReadColumn);
    }

    function rowsCompleted(results, more) {

        if (!more) {
            notify.emit('done');
        }

        if (id > 0) {
            outputParams = native.unbind(id);
        }

        if (callback) {
            callback(null, results, more, outputParams);
        }
    }

    function rowsAffected(nextResultSetInfo) {

        var rowCount = nextResultSetInfo.rowCount;
        var preRowCount = nextResultSetInfo.preRowCount;
        var moreResults = !nextResultSetInfo.endOfResults;
        notify.emit('rowcount', preRowCount);

        var state = {
            meta : null,
            rowcount : rowCount
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
                native.readRow(onReadRow);
            }
            else {
                native.nextResult(onNextResult);
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

            native.readColumn(column, onReadColumn);
        }
        // otherwise, go to the next result set
        else {
            native.nextResult(onNextResult);
        }
    }

    var invoke = callable ? procedure_internal : query_internal;

    id = invoke(native, query, params, function (err, results, params) {

        outputParams = params;

        if (err) {
            routeStatementError(err, callback, notify);
            nextOp(q);
            return;
        }

        meta = results;
        if (meta.length > 0) {
            notify.emit('meta', meta);
            native.readRow(onReadRow);
        }
        else {
            native.nextResult(onNextResult)
        }
    });
}

exports.routeStatementError = routeStatementError;
exports.nextOp = nextOp;
exports.validateParameters = validateParameters;
exports.query_internal = query_internal;
exports.procedure_internal = procedure_internal;
exports.getChunkyArgs = getChunkyArgs;
exports.objectify = objectify;
exports.StreamEvents = StreamEvents;
exports.readall = readall;