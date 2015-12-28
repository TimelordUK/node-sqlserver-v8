/**
 * Created by Stephen on 9/28/2015.
 */

var dm = require('./driverMgr');
var pm = require('./procedureMgr');
var tm = require('./tableMgr');

function ConnectionWrapper (qu, defcb, nat, name) {

    var q = qu;
    var defaultCallback = defcb;
    var native = nat;
    var id = name;

    var t = new tm.TableMgr(this, q, native);
    var p = new pm.ProcedureMgr(this, q, native);

    function tableMgr() {
        return t;
    }

    function procedureMgr() {
        return p;
    }

    function getQueryObject(p) {
        var params = typeof(p) === 'string' ?
        {
            query_str : p,
            query_timeout : 0
        }
            : p;

        return params;
    }

    function close (immediately, callback) {

        // require only callback
        if (typeof immediately == 'function') {

            callback = immediately;
            immediately = false;
        }
        else if (typeof immediately != 'boolean' && typeof immediately != 'undefined') {

            throw new Error("[msnodesql] Invalid parameters passed to close.");
        }

        function onClose(err) {

            callback(err);

            // empty the queue
            q = [];
        }

        callback = callback || defaultCallback;

        // make calls on this connection throw errors now that the connection is closed.
        this.close = function () { /* noop */
        };
        this.queryRaw = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        this.query = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        this.beginTransaction = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        this.commit = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };
        this.rollback = function () {
            throw new Error("[msnodesql] Connection is closed.");
        };

        if (immediately || q.length == 0) {

            native.close(onClose);
        }
        else {

            // since the queue is not empty, there is a pending operation, so add the close to be done
            // after that operation finishes
            var op = {
                fn : function (callback) {
                    native.close(callback)
                }, args : [onClose]
            };
            q.push(op);
        }
    };

    function queryRaw (queryOrObj, paramsOrCallback, callback) {

        var queryObj = getQueryObject(queryOrObj);

        dm.validateParameters(
            [
                {type: 'string', value: queryObj.query_str, name: 'query string'}
            ], 'queryRaw');

        var notify = new dm.StreamEvents();

        var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

        var op = {fn: dm.readall, args: [q, notify, native, queryObj, chunky.params, false, chunky.callback]};
        q.push(op);

        if (q.length == 1) {
            dm.readall(q, notify, native, queryObj, chunky.params, false, chunky.callback);
        }

        return notify;
    };

    function query (queryOrObj, paramsOrCallback, callback) {

        var queryObj = getQueryObject(queryOrObj);

        dm.validateParameters([
            {
                type: 'string',
                value: queryObj.query_str,
                name: 'query string'
            }
        ], 'query');

        var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

        function onQueryRaw(err, results, more) {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, dm.objectify(results), more);
            }
        }

        return this.queryRaw(queryOrObj, chunky.params, onQueryRaw);
    };

    function beginTransaction(callback) {

        function onBeginTxn(err) {
            callback(err);
            dm.nextOp(q);
        }

        callback = callback || defaultCallback;

        var op = {
            fn: function (callback) {
                native.beginTransaction(callback)
            }, args: [onBeginTxn]
        };
        q.push(op);

        if (q.length == 1) {
            native.beginTransaction(onBeginTxn);
        }
    };
    function commit(callback) {

        function onCommit(err) {

            callback(err);

            dm.nextOp(q);
        }

        callback = callback || defaultCallback;

        var op = {
            fn: function (callback) {
                native.commit(callback);
            }, args: [onCommit]
        };
        q.push(op);

        if (q.length == 1) {
            native.commit(onCommit);
        }
    };
    function rollback(callback) {

        function onRollback(err) {

            callback(err);

            dm.nextOp(q);
        }

        callback = callback || defaultCallback;

        var op = {
            fn: function (callback) {
                native.rollback(callback);
            }, args: [onRollback]
        };
        q.push(op);

        if (q.length == 1) {
            native.rollback(onRollback);
        }
    };

    this.id = id;

    this.close = close;
    this.queryRaw = queryRaw;
    this.query = query;
    this.beginTransaction = beginTransaction;
    this.commit = commit;
    this.rollback = rollback;
    this.tableMgr = tableMgr;
    this.procedureMgr = procedureMgr;

    return this;
};

exports.ConnectionWrapper = ConnectionWrapper;
