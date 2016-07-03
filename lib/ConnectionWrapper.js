/**
 * Created by Stephen on 9/28/2015.
 */

var sql = require('./sqlserver.native');
var dm = require('./driverMgr');
var pm = require('./procedureMgr');
var tm = require('./tableMgr');

function ConnectionWrapper (qu, defCb, nat, name)
{
    var q = qu;
    var defaultCallback = defCb;
    var native = nat;
    var id = name;
    var closed = false;

    var inst = this;

    var t = new tm.TableMgr(inst, q, native);
    var p = new pm.ProcedureMgr(inst, q, native);

    function tableMgr() {
        return t;
    }

    function procedureMgr() {
        return p;
    }

    function stubConnection() {
        // make calls on this connection throw errors now that the connection is closed.
        inst.close = function () { /* noop */
        };
        inst.queryRaw = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        inst.query = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        inst.beginTransaction = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        inst.commit = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        inst.rollback = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
    }

    function makeOp(fn, args) {
        return {
            fn : fn,
            args : args
        };
    }

    function close(immediately, callback) {

        function onClose(err) {
            setImmediate(function () {
                callback(err);
                closed = true;
                // empty the queue
                q = [];
            })
        }

        // require only callback
        if (typeof immediately == 'function') {
            callback = immediately;
            immediately = false;
        }
        else if (typeof immediately != 'boolean' && typeof immediately != 'undefined') {
            throw new Error("[msnodesql] Invalid parameters passed to close.");
        }

        callback = callback || defaultCallback;

        stubConnection();
        var op = makeOp(function (callback) {
            native.close(callback)
        }, [onClose]);
        dm.execQueueOp(q, op);
    }

    function queryRaw (queryOrObj, paramsOrCallback, callback) {
        var notify = new dm.StreamEvents();
        var chunky = dm.getChunkyArgs(paramsOrCallback, callback);
        queryRawNotify(notify, queryOrObj, chunky);
        return notify;
    }

    function queryRawNotify (notify, queryOrObj, chunky) {
        var queryObj = dm.validateQuery(queryOrObj, 'queryRaw');
        var op = makeOp(dm.readall_query,[q, notify, native, queryObj, chunky.params, chunky.callback]);
        dm.execQueueOp(q, op);
    }

    function query(queryOrObj, paramsOrCallback, callback) {
        var notify = new dm.StreamEvents();
        var chunky = dm.getChunkyArgs(paramsOrCallback, callback);
        queryNotify(notify, queryOrObj, chunky);
        return notify;
    }

    function queryNotify (notify, queryOrObj, chunky) {
        dm.validateQuery(queryOrObj, 'query');
        function onQueryRaw(err, results, more) {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, dm.objectify(results), more);
            }
        }

        return queryRawNotify(notify, queryOrObj, dm.getChunkyArgs(chunky.params, onQueryRaw));
    }

    function beginTransaction(callback) {

        function onBeginTxn(err) {
            callback(err);
            dm.nextOp(q);
        }

        callback = callback || defaultCallback;
        var op = makeOp(function (callback) {
            native.beginTransaction(callback)
        }, [onBeginTxn]);
        dm.execQueueOp(q, op);
    }

    function commit(callback) {

        function onCommit(err) {
            callback(err);
            dm.nextOp(q);
        }

        callback = callback || defaultCallback;

        var op = makeOp(function (callback) {
            native.commit(callback);
        }, [onCommit]);
        dm.execQueueOp(q, op);
    }

    function rollback(callback) {

        function onRollback(err) {
            callback(err);
            dm.nextOp(q);
        }

        callback = callback || defaultCallback;

        var op = makeOp(function (callback) {
            native.rollback(callback);
        }, [onRollback]);
        dm.execQueueOp(q, op);
    }

    // inform driver to prepare the sql statement and reserve it for repeated use with parameters.

    function PreparedStatement(na, s, qu, c, n, m) {

        var native = na;
        var q = qu;
        var meta = m;
        var notify = n;
        var cw = c;
        var active = true;
        var signature = s;

        function getMeta() {
            return meta;
        }

        function getSignature() {
            return signature;
        }

        function getId() {
            return notify.getQueryId();
        }

        function preparedQuery(paramsOrCallback, callback) {

            if (!active) {
                if (callback) {
                    callback("error; prepared statement has been released.")
                }
            }
            var chunky = dm.getChunkyArgs(paramsOrCallback, callback);
            function onPreparedQuery(err, results, more) {
                if (chunky.callback) {
                    if (err) chunky.callback(err);
                    else chunky.callback(err, dm.objectify(results), more);
                }
            }

            var queryObj = {};
            var op = makeOp(dm.readall_prepared,[q, notify, native, queryObj, chunky.params, onPreparedQuery]);
            dm.execQueueOp(q, op);
        }

        function free(callback) {
            dm.freeStatement(q, native, notify.getQueryId(), function(err) {
                active = false;
                if (callback != null) {
                    callback(err);
                }
            })
        }

        this.preparedQuery = preparedQuery;
        this.meta = meta;
        this.notify = notify;
        this.connection = cw;
        this.free = free;
        this.getMeta = getMeta;
        this.getSignature = getSignature;
        this.getId = getId;

        return this;
    }

    function prepare(queryOrObj, callback) {

        var notify = new dm.StreamEvents();
        var chunky = dm.getChunkyArgs(callback);
        queryOrObj = dm.validateQuery(queryOrObj, 'prepare');
        function onPrepare(err, meta) {
            var prepared = new PreparedStatement(native, queryOrObj.query_str, q, inst, notify, meta);
            chunky.callback(err, prepared);
            dm.nextOp(q);
        }

        var op = makeOp(function (callback) {
            native.prepare(notify.getQueryId(), queryOrObj, callback);
        }, [onPrepare]);
        dm.execQueueOp(q, op);

        return notify;
    }

    this.id = id;

    this.queryNotify = queryNotify;
    this.queryRawNotify = queryRawNotify;
    this.close = close;
    this.queryRaw = queryRaw;
    this.query = query;
    this.beginTransaction = beginTransaction;
    this.commit = commit;
    this.rollback = rollback;
    this.tableMgr = tableMgr;
    this.procedureMgr = procedureMgr;
    this.prepare = prepare;

    return this;
}

var nextID = 0;

function getConnectObject(p) {
    return typeof(p) === 'string' ?
    {
        conn_str: p,
        connect_timeout: 0
    }
        : p;
}

function queryCloseOnDone(fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {
    var args = dm.getChunkyArgs(paramsOrCallback, callback);
    dm.validateQuery(queryOrObj, fn);
    var notify = new dm.StreamEvents();
    openFrom(fn, connectDetails, go);

    function go(err, conn) {
        if (err) {
            args.callback(err);
        } else {
            action(conn, notify, args);
            notify.on('done', function () {
                conn.close();
            })
        }
    }

    return notify;
}

function query(connectDetails, queryOrObj, paramsOrCallback, callback) {
    function action(conn, notify, args) {
        conn.queryNotify(notify, queryOrObj, args);
    }

    return queryCloseOnDone('query', action, connectDetails, queryOrObj, paramsOrCallback, callback);
}

function queryRaw(connectDetails, queryOrObj, paramsOrCallback, callback) {
    function action(conn, notify, args) {
        conn.queryRawNotify(notify, queryOrObj, args);
    }

    return queryCloseOnDone('queryRaw', action, connectDetails, queryOrObj, paramsOrCallback, callback);
}

function open(params, callback) {
    return openFrom('open', params, callback);
}

function openFrom(parentFn, params, callback) {

    function Conn(p, cb, id) {

        var callback = cb;
        var q = [];
        var native = new sql.Connection();
        var connection = new ConnectionWrapper(q, defaultCallback, native, id);
        var connectObj = p;

        function defaultCallback(err) {
            if (err) {
                throw new Error(err);
            }
        }

        function open() {

            dm.validateParameters(
                [
                    {
                        type: 'string',
                        value: connectObj.conn_str,
                        name: 'connection string'
                    },
                    {
                        type: 'function',
                        value: callback,
                        name: 'callback'
                    }
                ],
                parentFn);

            callback = callback || defaultCallback;

            function queueCb(err) {
                setImmediate(function () {
                    callback(err, connection);
                });
            }

            native.open(connectObj, queueCb);
        }

        this.id = connection.id;
        this.connection = connection;
        this.open = open;

        return this;
    }

    var c = new Conn(getConnectObject(params), callback, nextID);
    ++nextID;
    c.open();

    return c.connection;
}

exports.query = query;
exports.queryRaw = queryRaw;
exports.open = open;

