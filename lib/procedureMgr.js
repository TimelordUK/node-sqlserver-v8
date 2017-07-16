/**
 * Created by Stephen on 9/27/2015.
 */

function BoundProcedure(dm, n, c, m, na, pol, to) {
    var conn = c;
    var driverMgr = dm;
    var nf = n;
    var meta = m;
    var name = na;
    var timeout = to;
    var polling = pol;

    function setTimeout(t) {
        timeout = t;
    }

    function setPolling(b) {
        polling = b;
    }

    function getMeta() {
        return meta;
    }

    function getName() {
        return name;
    }

    function call(paramsOrCb, fn) {
        var vec;
        var cb;
        if (Array.isArray(paramsOrCb)) {
            vec = paramsOrCb;
            cb = fn;
        } else {
            vec = [];
            cb = paramsOrCb;
        }
        var notify = new nf.StreamEvents();
        notify.setConn(conn);
        private_call(notify, vec, cb);

        return notify;
    }

    function bindParams(meta, params) {
        var j = 0;
        for (var i = 0; i < params.length; ++i) {
            while (j < meta.params.length && meta.params[j].is_output === true) {
                ++j;
            }
            if (j < meta.params.length) meta.params[j++].val = params[i];
        }
    }

    function private_call(notify, params, cb) {
        bindParams(meta, params);
        callStoredProcedure(notify, meta.signature, meta.params, function (err, results, output) {
            cb(err, results, output);
        });
    }

    function callStoredProcedure(notify, signature, paramsOrCallback, callback) {
        var queryOb = {
            query_str: signature,
            query_timeout: timeout,
            query_polling: polling
        };

        nf.validateParameters(
            [
                {
                    type: 'string',
                    value: queryOb.query_str,
                    name: 'query string'
                }
            ], 'callproc');

        notify.setQueryObj(queryOb);
        var chunky = nf.getChunkyArgs(paramsOrCallback, callback);

        function onProcRaw(err, results, outputParams, more) {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, driverMgr.objectify(results), more, outputParams);
            }
        }

        driverMgr.realAllProc(notify, queryOb, chunky.params, onProcRaw);

        return notify;
    }

    var function_api = {
        call: call,
        setTimeout: setTimeout,
        setPolling: setPolling,
        getMeta: getMeta,
        getName: getName
    };

    return function_api;
}

function ProcedureMgr(c, n, dm) {

    var cache = {};
    var conn = c;
    var timeout = 0;
    var polling = false;
    var driverMgr = dm;
    var nf = n;

    function describeProcedure(procName, callback) {
        var sql =
            "select \n" +
            "is_output, \n" +
            "name, \n" +
            "type_id   = type_name(user_type_id), \n" +
            "max_length, \n" +
            "'order'  = parameter_id, \n" +
            "'collation'   = convert(sysname, \n" +
            " case when system_type_id in (35, 99, 167, 175, 231, 239) \n" +
            " then ServerProperty('collation') end) \n" +
            " from sys.parameters sp where object_id = object_id('" + procName + "') \n";

        var ret = {
            is_output: true,
            name: '@returns',
            type_id: 'int',
            max_length: 4,
            order: 0,
            collation: null
        };

        conn.query(sql, function (err, results) {
            results.unshift(ret);
            callback(err, results);
        });
    }

    function describe(name, cb) {
        createProcedure(name, function (p) {
            if (p) {
                cb(p);
            } else {
                cb('could not get definition of ' + name);
            }
        })
    }

    function get(name, cb) {
        createProcedure(name, function (p) {
            cb(p);
        })
    }

    function callproc(name, paramsOrCb, cb) {
        createProcedure(name, function (p) {
            p.call(paramsOrCb, cb);
        })
    }

    function createProcedure(name, cb) {
        var procedure = cache[name];
        if (!procedure) {
            describeProcedure(name, function (err, pv) {
                var signature = build(pv, name);
                var summary = summarise(name, pv);
                var meta = {
                    signature: signature,
                    summary: summary,
                    params: pv
                };

                procedure = new BoundProcedure(driverMgr, nf, conn, meta, name, polling, timeout);
                cache[name] = procedure;
                cb(procedure);
            });
        } else {
            cb(procedure);
        }
    }

    function descp(p) {
        var s = "";
        s += p.name + " [ " + p.type_id + (p.is_output ? " out " : " in ") + " ] ";
        return s;
    }

    function summarise(name, pv) {
        var s = descp(pv[0]) + " " + name + "( ";
        for (var i = 1; i < pv.length; ++i) {
            s += descp(pv[i]);
            if (i < pv.length - 1) s += ", ";
        }
        s += " ) ";
        return s;
    }

    function build(pv, name) {
        var q = "{ ";
        var len = pv.length;
        q += "? = call " + name + "(";
        for (var r = 1; r < len; ++r) {
            q += " ?";
            if (r < len - 1) q += ", ";
        }
        q += ") }";

        return q;
    }

    function setTimeout(t) {
        timeout = t;
    }

    function clear() {
        Object.keys(cache).forEach(function(k) {
            delete myObject[k];
        })
    }

    function setPolling(b) {
        polling = b;
    }

    function getCount() {
        return  Object.keys(cache).length;
    }

    var public_api = {
        setTimeout: setTimeout,
        setPolling: setPolling,
        callproc: callproc,
        describe: describe,
        getCount:getCount,
        clear:clear,
        get:get
    };

    return public_api;
}

exports.ProcedureMgr = ProcedureMgr;