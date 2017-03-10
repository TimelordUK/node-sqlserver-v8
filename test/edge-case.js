"use strict";
exports.sql = require('msnodesqlv8');
let supp = require('../demo-support');
let argv = require('minimist')(process.argv.slice(2));
let support = null;
let procedureHelper = null;
let helper = null;
let busy = argv.t == 'busy';
let memory = argv.t == 'memory';
class BusyConnection {
    run(conn_str, argv) {
        let delay = argv.delay || 5000;
        let severity = argv.severity || 9;
        exports.sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            setInterval(() => {
                let query = `RAISERROR('User JS Error', ${severity}, 1);SELECT ${x}+${x};`;
                conn.queryRaw(query, (err, results, more) => {
                    console.log(">> queryRaw");
                    console.log(err);
                    console.log(JSON.stringify(results, null, 2));
                    if (more)
                        return;
                    conn.queryRaw(query, (e, r) => {
                        console.log(">> queryRaw2");
                        console.log(e);
                        console.log(JSON.stringify(r, null, 2));
                        ++x;
                        console.log("<< queryRaw2");
                    });
                    console.log("<< queryRaw");
                });
            }, delay);
        });
    }
}
class MemoryStress {
    run(conn_str, argv) {
        let delay = argv.delay || 5000;
        exports.sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }
            setInterval(() => {
                conn.queryRaw(`SELECT ${x}+${x};`, (err, results) => {
                    if (err) {
                        throw err;
                    }
                    console.log(results);
                });
            }, delay);
        });
    }
}
let test;
if (busy) {
    test = new BusyConnection();
}
else if (memory) {
    test = new MemoryStress();
}
supp.GlobalConn.init(exports.sql, (co) => {
    let conn_str = co.conn_str;
    support = co.support;
    procedureHelper = new support.ProcedureHelper(conn_str);
    procedureHelper.setVerbose(false);
    helper = co.helper;
    test.run(conn_str, argv);
});
//# sourceMappingURL=edge-case.js.map