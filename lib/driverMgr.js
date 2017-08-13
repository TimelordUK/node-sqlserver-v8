
var wq = require('./workQueue');
var nf = require('./notifier');
var dr = require('./driverRead');

function DriverMgr(sql) {

    var driverCommandEnum = {
        CANCEL :10,
        COMMIT : 11,
        ROLLBACK : 12,
        BEGIN_TRANSACTION : 13,
        PREPARE : 14,
        FREE_STATEMENT : 15,
        QUERY : 16,
        CLOSE : 17,
        UNBIND : 18
    };

    var native = sql;
    var workQueue = new wq.WorkQueue();
    var reader = new dr.DriverRead(native, workQueue);

    function emptyQueue() {
        workQueue.emptyQueue();
    }

    function close(callback) {
        workQueue.enqueue(driverCommandEnum.CLOSE, function (cb) {
            native.close(cb);
        }, [callback]);
    }

    function execCancel(qid, i, callback) {
        // send cancel directly to driver.
        var currentItem = workQueue.get(i);
        var args = currentItem.args;
        var cb = args[3];

        if (i === 0) {
            native.pollingMode(qid, true, function () {
                native.cancelQuery(qid, function (err) {
                    setImmediate(function () {
                        callback(err);
                    });
                });
            });
        } else {
            workQueue.dropItem(i);
            setImmediate(function () {
                // make a callback on the cancel request with no error.
                callback(null);
                // invoke the listener as if this has come from driver so user query callback can be invoked.
                cb(new Error('Error: [msnodesql] (query removed from q) Operation canceled', [], false));
            });
        }
        return true;
    }

    // if this relates to the active query being executed then immediately send
    // the cancel, else the query can be removed from the queue and never submitted to the driver.

    function cancel(qid, callback) {

        if (workQueue.length() === 0) {
            setImmediate(function() {
                callback(new Error('Error: [msnodesql] cannot cancel query (empty queue) id ' + qid, [], false));
            });
            return;
        }

        var i = -1;

        var first = workQueue.first(function(idx, currentItem) {
            if (currentItem.commandId !== driverCommandEnum.QUERY) return false;
            var args = currentItem.args;
            var notify = args[0];
            var currentQueryId = notify.getQueryId();
            i = idx;
            return qid === currentQueryId;
        });

        if (first) {
            execCancel(qid, i, callback);
        }else {
            setImmediate(function() {
                callback(new Error('Error: [msnodesql] cannot cancel query (not found) id ' + qid, [], false));
            });
        }
    }

    function prepareQuery(notify, queryOrObj, callback) {
        native.prepare(notify.getQueryId(), queryOrObj, callback);
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
            if (name !== '' && !names[name]) {
                names[name] = idx;
            }
            else {
                var extra = 0;
                var candidate = 'Column' + idx;
                while (names[candidate]) {
                    candidate = 'Column' + idx + '_' + extra++;
                }
                names[candidate] = idx;
            }
        }

        var rows = [];
        if (results.rows) {
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

    function readall_proc(notify, query, params, callback) {
        setImmediate(function () {
            reader.fetch(notify, query, params, {
                    begin: procedure_internal,
                    end: procUnbind
                }
                , callback);
        });
    }

    function readall_query(notify, query, params, callback) {
        setImmediate(function () {
            reader.fetch(notify, query, params, {
                begin: query_internal,
                end: cbFreeStatement
            }, callback);
        });
    }

    function readall_prepared(notify, query, params, callback) {
        setImmediate(function () {
            reader.fetch(notify, query, params, {
                begin: prepared_internal,
                end: cbNextStatement
            }, callback);
        });
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
            workQueue.nextOp();
        }
    }

// for a stored procedure, the out parameters / return value can
// only be unbound when rest of query completes. The output params
// will now be ready to fetch out of the statement.

    function procUnbind(queryId, outputParams, callback, results, more) {
        function onUnbind(err, op) {
            outputParams = op;
            cbFreeStatement(queryId, outputParams, callback, results, more);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.UNBIND, function (cb) {
            //noinspection JSUnresolvedFunction
            native.unbind(queryId, cb);
        }, [onUnbind]);
    }

    function freeStatement(queryId, callback) {

        function onFree() {
            callback(queryId);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.FREE_STATEMENT, function (cb) {
            native.freeStatement(queryId, cb);
        }, [onFree]);
    }

    function beginTransaction(callback) {

        function onBegin(err) {
            callback(err);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.BEGIN_TRANSACTION, function (cb) {
            native.beginTransaction(cb)
        }, [onBegin]);
    }

    function rollback(callback) {

        function onRollback(err) {
            callback(err);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.ROLLBACK, function (cb) {
            native.rollback(cb);
        }, [onRollback]);
    }

    function commit(callback) {

        function onCommit(err) {
            callback(err);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.COMMIT, function (cb) {
            native.commit(cb);
        }, [onCommit]);
    }

    function prepare(notify, queryOrObj, callback) {

        function onPrepare(err, meta) {
            callback(err, meta);
            workQueue.nextOp();
        }

        workQueue.enqueue(driverCommandEnum.PREPARE,function (cb) {
            prepareQuery(notify, queryOrObj, cb);
        }, [onPrepare]);
    }

    function readAllPrepared(notify, queryObj, params, cb) {
        workQueue.enqueue(driverCommandEnum.QUERY, readall_prepared,[notify, queryObj, params, cb]);
    }

    function readAllQuery(notify, queryObj, params, cb) {
        workQueue.enqueue(driverCommandEnum.QUERY, readall_query, [notify, queryObj, params, cb]);
    }

    function realAllProc(notify, queryObj, params, cb) {
        workQueue.enqueue(driverCommandEnum.QUERY, readall_proc, [notify, queryObj, params, cb]);
    }

    return {
        cancel: cancel,
        commit: commit,
        rollback: rollback,
        beginTransaction: beginTransaction,
        prepare: prepare,
        objectify: objectify,
        freeStatement: freeStatement,
        readAllQuery: readAllQuery,
        realAllProc: realAllProc,
        readAllPrepared: readAllPrepared,
        emptyQueue: emptyQueue,
        close: close
    };
}

exports.DriverMgr = DriverMgr;
exports.NotifyFactory = nf.NotifyFactory;