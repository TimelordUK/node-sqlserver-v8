/**
 * Created by Stephen on 9/27/2015.
 */

function ProcedureMgr(c, n, dm) {

    var cache = {};
    var conn = c;
    var timeout = 0;
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

    function callStoredProcedure(signature, paramsOrCallback, callback) {
        var queryOb = {
            query_str: signature,
            query_timeout: timeout
        };

        nf.validateParameters(
            [
                {
                    type: 'string',
                    value: queryOb.query_str,
                    name: 'query string'
                }
            ], 'callproc');

        var chunky = nf.getChunkyArgs(paramsOrCallback, callback);

        function onProcRaw(err, results, outputParams, more) {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, driverMgr.objectify(results), more, outputParams);
            }
        }

        var notify = new nf.StreamEvents();
        driverMgr.realAllProc(notify, queryOb, chunky.params, onProcRaw);

        return notify;
    }

    function describe(name, cb) {
        var meta = cache[name];
        if (meta == null) {
            describeProcedure(name, function (err, pv) {
                var signature = build(pv, name);
                var summary = summarise(name, pv);
                var meta = {
                    signature : signature,
                    summary : summary,
                    params : pv
                };
                cache[name] = meta;
                cb(meta);
            });
        }else cb(meta);
    }

    function descp(p) {
        var s= "";
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

    function callproc(name, paramsOrCb, fn) {
        var vec;
        var cb;
        if (Array.isArray(paramsOrCb)) {
            vec = paramsOrCb;
            cb = fn;
        }else {
            vec = [];
            cb = paramsOrCb;
        }

        describe(name, function(meta) {
            call(meta, vec, cb);
        });
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

    function call(meta, params, cb ) {
        bindParams(meta, params);
        callStoredProcedure(meta.signature, meta.params, function (err, results, output) {
            cb(err, results, output);
        });
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

    var public_api = {
        setTimeout : setTimeout,
        callproc : callproc,
        describe : describe
    };

    return public_api;
}

exports.ProcedureMgr = ProcedureMgr;