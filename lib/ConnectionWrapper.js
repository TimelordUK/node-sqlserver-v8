/**
 * Created by Stephen on 9/28/2015.
 */

var sql = require('./sqlserver.native');
var dm = require('./driverMgr');
var pm = require('./procedureMgr');
var tm = require('./tableMgr');

function ConnectionWrapper (driver, defCb, name)
{
    var defaultCallback = defCb;
    var id = name;
    var closed = false;
    var driverMgr = driver;
    var inst = this;
    var nf = new dm.NotifyFactory();

    var t = new tm.TableMgr(inst);
    var p = new pm.ProcedureMgr(inst, nf, driverMgr);

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

    function close(immediately, callback) {

        function onClose(err) {
            setImmediate(function () {
                closed = true;
                driverMgr.emptyQueue();
                callback(err);
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
        driverMgr.close(onClose);
    }

    function queryRaw (queryOrObj, paramsOrCallback, callback) {
        var notify = new nf.StreamEvents();
        var chunky = nf.getChunkyArgs(paramsOrCallback, callback);
        queryRawNotify(notify, queryOrObj, chunky);
        return notify;
    }

    function queryRawNotify (notify, queryOrObj, chunky) {
        var queryObj = nf.validateQuery(queryOrObj, 'queryRaw');
        driverMgr.readAllQuery(notify, queryObj, chunky.params, chunky.callback);
    }

    function query(queryOrObj, paramsOrCallback, callback) {
        var notify = new nf.StreamEvents();
        var chunky = nf.getChunkyArgs(paramsOrCallback, callback);
        queryNotify(notify, queryOrObj, chunky);
        return notify;
    }

    function queryNotify (notify, queryOrObj, chunky) {
        nf.validateQuery(queryOrObj, 'query');
        function onQueryRaw(err, results, more) {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, driverMgr.objectify(results), more);
            }
        }

        return queryRawNotify(notify, queryOrObj, nf.getChunkyArgs(chunky.params, onQueryRaw));
    }

    function beginTransaction(callback) {

        callback = callback || defaultCallback;

        driverMgr.beginTransaction(callback);
    }

    function commit(callback) {

        callback = callback || defaultCallback;

        driverMgr.commit(callback);
    }

    function rollback(callback) {

        callback = callback || defaultCallback;

        driverMgr.rollback(callback);
    }

    // inform driver to prepare the sql statement and reserve it for repeated use with parameters.

    function PreparedStatement(d, s, c, n, m) {

        var driverMgr = d;
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
            var chunky = nf.getChunkyArgs(paramsOrCallback, callback);
            function onPreparedQuery(err, results, more) {
                if (chunky.callback) {
                    if (err) chunky.callback(err);
                    else chunky.callback(err, driverMgr.objectify(results), more);
                }
            }

            driverMgr.readAllPrepared(notify, {}, chunky.params, onPreparedQuery);
        }

        function free(callback) {
            driverMgr.freeStatement(notify.getQueryId(), function(err) {
                active = false;
                if (callback != null) {
                    callback(err);
                }
            })
        }

        this.preparedQuery = preparedQuery;
        this.meta = meta;
        //noinspection JSUnresolvedVariable
        this.connection = cw;
        this.free = free;
        this.getMeta = getMeta;
        this.getSignature = getSignature;
        this.getId = getId;

        return this;
    }

    function prepare(queryOrObj, callback) {

        var notify = new nf.StreamEvents();
        var chunky = nf.getChunkyArgs(callback);
        queryOrObj = nf.validateQuery(queryOrObj, 'prepare');

        function onPrepare(err, meta) {
            var prepared = new PreparedStatement(driverMgr, queryOrObj.query_str, inst, notify, meta);
            chunky.callback(err, prepared);
        }

        driverMgr.prepare(notify, queryOrObj, onPrepare);

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
        conn_str : p,
        connect_timeout : 0
    }
        : p;
}

function queryCloseOnDone(fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {

    var thisConn;
    var nf = new dm.NotifyFactory();
    var args = nf.getChunkyArgs(paramsOrCallback, callback);
    var notify = new nf.StreamEvents();

    function complete(err, res, more) {
        if (!more && thisConn != null) {
            thisConn.close(function () {
                notify.emit('closed', notify.getQueryId());
                if (args.callback != null) args.callback(err, res, more);
            });
        } else {
            if (args.callback != null) args.callback(err, res, more);
        }
    }

    var args2 =
    {
        params : args.params,
        callback : complete
    };

    nf.validateQuery(queryOrObj, fn);
    openFrom(fn, connectDetails, go);

    function go(err, conn) {
        thisConn = conn;
        if (err) {
            args2.callback(err, null);
        } else {
            action(conn, notify, args2);
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
        var workQueue = [];
        //noinspection JSUnresolvedFunction
        var native = new sql.Connection();
        var driverMgr = new dm.DriverMgr(native, workQueue);
        var nf = new dm.NotifyFactory();
        var connection = new ConnectionWrapper(driverMgr, defaultCallback, id);
        var connectObj = p;

        function defaultCallback(err) {
            if (err) {
                throw new Error(err);
            }
        }

        function open() {

            nf.validateParameters(
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
        //noinspection JSUnresolvedVariable
        this.connection = connection;
        //noinspection JSUnresolvedVariable
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