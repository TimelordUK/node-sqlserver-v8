/**
 * Created by Stephen on 9/28/2015.
 */

var dm = require('./driverMgr');
var pm = require('./procedureMgr');
var tm = require('./tableMgr');

exports.ConnectionWrapper = function (qu, defcb, nat, name) {

    var q = qu;
    var defaultCallback = defcb;
    var native = nat;
    var id = name;

    this.close = function (immediately, callback) {

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
                fn: function (callback) {
                    native.close(callback)
                }, args: [onClose]
            };
            q.push(op);
        }
    };

    this.queryRaw = function (query, paramsOrCallback, callback) {

        dm.validateParameters(
            [
                {type: 'string', value: query, name: 'query string'}
            ], 'queryRaw');

        var notify = new dm.StreamEvents();

        var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

        var op = {fn: dm.readall, args: [q, notify, native, query, chunky.params, false, chunky.callback]};
        q.push(op);

        if (q.length == 1) {
            dm.readall(q, notify, native, query, chunky.params, false, chunky.callback);
        }

        return notify;
    };

    this.query = function (query, paramsOrCallback, callback) {

        dm.validateParameters([
            {
                type: 'string',
                value: query,
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

        return this.queryRaw(query, chunky.params, onQueryRaw);
    };

    this.beginTransaction = function (callback) {

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

    this.commit = function (callback) {

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

    this.rollback = function (callback) {

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

    this.procedureMgr = function () {
        return pm.procedureMgr(this, q, native);
    };

    this.tableMgr = function () {
        return tm.tableMgr(this, q, native);
    };

    this.id = id;

    return this;
};
