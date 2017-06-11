var events = require('events');
var util = require('util');

function NotifyFactory() {

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

    function getQueryObject(p) {
        return typeof(p) === 'string' ?
        {
            query_str: p,
            query_timeout: 0
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

function DriverMgr(sql, queue) {

    var native = sql;
    var workQueue = queue;

    function emptyQueue() {
        while (workQueue.length > 0) {
            workQueue.shift();
        }
    }

    function close(callback) {
        var op = makeOp(function (cb) {
            native.close(cb);
        }, [callback]);
        execQueueOp(op);
    }

    function prepareQuery(notify, queryOrObj, callback) {
        native.prepare(notify.getQueryId(), queryOrObj, callback);
    }

    function routeStatementError(err, callback, notify, more) {
        if (callback) {
            callback(err, null, more);
        }
        else if (notify && notify.listeners('error').length > 0) {
            notify.emit('error', err);
        }
        else {
            throw new Error(err);
        }
    }

    function nextOp() {

        workQueue.shift();
        if (workQueue.length != 0) {
            var op = workQueue[0];
            op.fn.apply(op.fn, op.args);
        }
    }

    function execQueueOp(op) {
        workQueue.push(op);
        if (workQueue.length == 1) {
            op.fn.apply(op.fn, op.args);
        }
    }

    function prepared_internal(queryId, query, params, callback) {
        function onBind(err, meta) {
            if (callback) {
                callback(err, meta);
            }
        }

        //noinspection JSUnresolvedFunction
        native.bindQuery(queryId, params, onBind);
    }

    function query_internal(queryId, query, params, callback) {

        function onQuery(err, results, more) {
            if (callback) {
                callback(err, results, more);
            }
        }

        return native.query(queryId, query, params, onQuery);
    }

    function procedure_internal(queryId, procedure, params, callback) {

        function onProc(err, results, params) {
            if (callback) {
                callback(err, results, params);
            }
        }
        //noinspection JSUnresolvedFunction
        return native.callProcedure(queryId, procedure, params, onProc);
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

    function makeOp(fn, args) {
        return {
            fn: fn,
            args: args
        };
    }

    function readall_proc(notify, query, params, callback) {
        readall_internal(notify, query, params, {
                begin: procedure_internal,
                end: procUnbind
            }
            , callback);
    }

    function readall_query(notify, query, params, callback) {
        readall_internal(notify, query, params, {
            begin: query_internal,
            end: cbFreeStatement
        }, callback);
    }

    function readall_prepared(notify, query, params, callback) {
        readall_internal(notify, query, params, {
            begin: prepared_internal,
            end: cbNextStatement
        }, callback);
    }

    function cbFreeStatement(queryId, outputParams, callback, results, more) {

        if (!more) {
            freeStatement(queryId, function () {
            });
        }

        if (callback) {
            callback(null, results, more, outputParams);
        }
    }

    function cbNextStatement(queryId, outputParams, callback, results, more) {
        if (callback) {
            callback(null, results, more, outputParams);
        }
        if (!more) {
            nextOp();
        }
    }

// for a stored procedure, the out parameters / return value can
// only be unbound when rest of query completes. The output params
// will now be ready to fetch out of the statement.

    function procUnbind(queryId, outputParams, callback, results, more) {
        function onUnbind(err, op) {
            outputParams = op;
            cbFreeStatement(queryId, outputParams, callback, results, more);
            nextOp();
        }

        var op = makeOp(function (cb) {
            //noinspection JSUnresolvedFunction
            native.unbind(queryId, cb);
        }, [onUnbind]);
        execQueueOp(op);
    }

    function readall_internal(notify, query, params, invokeObject, callback) {

        var meta;
        var column;
        var rows = [];
        var rowindex = 0;
        var outputParams = [];

        var queryId = notify.getQueryId();

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

        function onNextResult(err, nextResultSetInfo, more) {
            setImmediate(function () {
                queued_onNextResult(err, nextResultSetInfo, more);
            });
        }

        function onReadRow(err, endOfRows) {
            setImmediate(function () {
                queued_onReadRow(err, endOfRows);
            });
        }

        function queued_onReadColumnMore(err, results) {

            if (err) {
                routeStatementError(err, callback, notify, false);
                nextOp();
                return;
            }

            var data = results.data;
            var more = results.more;

            notify.emit('column', column, data, more);

            if (callback) {
                rows[rows.length - 1][column] += data;
            }

            if (more) {
                //noinspection JSUnresolvedFunction
                native.readColumn(queryId, column, onReadColumnMore);
                return;
            }

            column++;
            if (column >= meta.length) {
                //noinspection JSUnresolvedFunction
                native.readRow(queryId, onReadRow);
                return;
            }

            //noinspection JSUnresolvedFunction
            native.readColumn(queryId, column, onReadColumn);
        }

        function queued_onReadColumn(err, results) {
            if (err) {
                routeStatementError(err, callback, notify, false);
                nextOp();
                return;
            }

            var data = results.data;
            var more = results.more;

            notify.emit('column', column, data, more);

            if (callback) {
                rows[rows.length - 1][column] = data;
            }

            if (more) {
                //noinspection JSUnresolvedFunction
                native.readColumn(queryId, column, onReadColumnMore);
                return;
            }

            column++;

            if (column >= meta.length) {
                //noinspection JSUnresolvedFunction
                native.readRow(queryId, onReadRow);
                return;
            }
            //noinspection JSUnresolvedFunction
            native.readColumn(queryId, column, onReadColumn);
        }

        function rowsCompleted(results, more) {

            if (!more) {
                notify.emit('done');
            }

            invokeObject.end(queryId, outputParams, callback, results, more);
        }

        function rowsAffected(nextResultSetInfo) {

            //noinspection JSUnresolvedVariable
            var rowCount = nextResultSetInfo.rowCount;
            //noinspection JSUnresolvedVariable
            var preRowCount = nextResultSetInfo.preRowCount;
            //noinspection JSUnresolvedVariable
            var moreResults = !nextResultSetInfo.endOfResults;
            notify.emit('rowcount', preRowCount);

            var state = {
                meta: null,
                rowcount: rowCount
            };

            rowsCompleted(state, moreResults);
        }

        function queued_onNextResult(err, nextResultSetInfo, more) {

            if (err) {
                routeStatementError(err, callback, notify, more);
                if (!more) {
                    nextOp();
                    return;
                }
            }

            if (!meta && !more) {
                rowsCompleted({meta: meta, rows: rows}, !nextResultSetInfo.endOfResults);
            }else
            // handle the just finished result reading
            if (meta && !err && meta.length == 0) {
                // if there was no metadata, then pass the row count (rows affected)
                rowsAffected(nextResultSetInfo);
            }
            else {
                // if more is true, no error set or results do not call back.
                if (more && rows && rows.length === 0) {
                    // otherwise, pass the accumulated results
                    //noinspection JSUnresolvedVariable
                }else {
                    rowsCompleted({meta: meta, rows: rows}, !nextResultSetInfo.endOfResults);
                }
            }

            // reset for the next resultset
            meta = nextResultSetInfo.meta;
            if (!meta) {
                native.nextResult(queryId, onNextResult);
                return;
            }
            rows = [];
            //noinspection JSUnresolvedVariable
            if (nextResultSetInfo.endOfResults) {
                // TODO: What about closed connections due to more being false in the callback?  See queryRaw below.
                nextOp();
            }
            else {
                // if this is just a set of rows
                if (meta.length > 0) {
                    notify.emit('meta', meta);
                    // kick off reading next set of rows
                    //noinspection JSUnresolvedFunction
                    native.readRow(queryId, onReadRow);
                }
                else {
                    //noinspection JSUnresolvedFunction
                    native.nextResult(queryId, onNextResult);
                }
            }
        }

        function queued_onReadRow(err, endOfRows) {
            if (err) {
                routeStatementError(err, callback, notify, false);
                nextOp();
            }
            // if there were rows and we haven't reached the end yet (like EOF)
            else if (meta.length > 0 && !endOfRows) {
                notify.emit('row', rowindex++);
                column = 0;
                if (callback) {
                    rows[rows.length] = [];
                }
                //noinspection JSUnresolvedFunction
                native.readColumn(queryId, column, onReadColumn);
            }
            // otherwise, go to the next result set
            else {
                //noinspection JSUnresolvedFunction
                native.nextResult(queryId, onNextResult);
            }
        }

        function onInvoke(err, results, params) {

            outputParams = params;

            if (err) {
                var more = params;
                if (!more) {
                    invokeObject.end(queryId, outputParams, function () {
                        routeStatementError(err, callback, notify, false);
                    }, null, more);
                    nextOp();
                    return;
                }else {
                    routeStatementError(err, callback, notify, true);

                }
            }

            meta = results;
            if (meta.length > 0) {
                notify.emit('meta', meta);
                //noinspection JSUnresolvedFunction
                native.readRow(queryId, onReadRow);
            }
            else {
                //noinspection JSUnresolvedFunction
                native.nextResult(queryId, onNextResult)
            }
        }

        invokeObject.begin(queryId, query, params, onInvoke);
    }

    function freeStatement(queryId, callback) {

        function onFree() {
            callback(queryId);
            nextOp();
        }

        var op = makeOp(function (cb) {
            native.freeStatement(queryId, cb);
        }, [onFree]);
        execQueueOp(op);
    }

    function beginTransaction(callback) {

        function onBegin(err) {
            callback(err);
            nextOp();
        }

        var op = makeOp(function (cb) {
            native.beginTransaction(cb)
        }, [onBegin]);
        execQueueOp(op);
    }

    function rollback(callback) {

        function onRollback(err) {
            callback(err);
            nextOp();
        }

        var op = makeOp(function (cb) {
            native.rollback(cb);
        }, [onRollback]);
        execQueueOp(op);
    }

    function commit(callback) {

        function onCommit(err) {
            callback(err);
            nextOp();
        }

        var op = makeOp(function (cb) {
            native.commit(cb);
        }, [onCommit]);
        execQueueOp(op);
    }

    function prepare(notify, queryOrObj, callback) {

        function onPrepare(err, meta) {
            callback(err, meta);
            nextOp();
        }

        var op = makeOp(function (cb) {
            prepareQuery(notify, queryOrObj, cb);
        }, [onPrepare]);
        execQueueOp(op);
    }

    function readAllPrepared(notify, queryObj, params, cb) {
        var op = makeOp(readall_prepared,[notify, queryObj, params, cb]);
        execQueueOp(op);
    }

    function readAllQuery(notify, queryObj, params, cb) {
        var op = makeOp(readall_query, [notify, queryObj, params, cb]);
        execQueueOp(op);
    }

    function realAllProc(notify, queryObj, params, cb) {
        var op = makeOp(readall_proc, [notify, queryObj, params, cb]);
        execQueueOp(op);
    }

    this.commit = commit;
    this.rollback = rollback;
    this.beginTransaction = beginTransaction;
    this.prepare = prepare;
    this.routeStatementError = routeStatementError;
    this.objectify = objectify;
    this.freeStatement = freeStatement;
    this.readAllQuery = readAllQuery;
    this.realAllProc = realAllProc;
    this.readAllPrepared = readAllPrepared;
    this.emptyQueue = emptyQueue;
    this.close = close;
}

exports.DriverMgr = DriverMgr;
exports.NotifyFactory = NotifyFactory;