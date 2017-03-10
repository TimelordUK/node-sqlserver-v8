import {MsNodeSqlDriverApiModule as v8} from '../lib/MsNodeSqlDriverApiModule'

import v8Connection = v8.v8Connection;
import v8PreparedStatement = v8.v8PreparedStatement;
import v8BindCb = v8.v8BindCb;
import v8BulkMgr = v8.v8BulkTableMgr;
import v8Error = v8.v8Error;

export const sql: v8.v8driver = require('msnodesqlv8');

let supp = require('../demo-support');
let argv = require('minimist')(process.argv.slice(2));

let support : any = null;
let procedureHelper : any = null;
let helper : any = null;
let busy : boolean = argv.t == 'busy';
let memory : boolean = argv.t == 'memory';

export interface SimpleTest
{
    run(conn_str:string, argv:any) : void;
}

class BusyConnection implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;
        let severity : number = argv.severity || 9;
        sql.open(conn_str, (err, conn) => {
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
                    if (more) return;
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

class MemoryStress implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;

        sql.open(conn_str, (err, conn) => {
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

let test : SimpleTest;

if (busy) {
    test = new BusyConnection();
}else if (memory) {
    test = new MemoryStress();
}

supp.GlobalConn.init(sql, (co: any) => {
        let conn_str = co.conn_str;
        support = co.support;
        procedureHelper = new support.ProcedureHelper(conn_str);
        procedureHelper.setVerbose(false);
        helper = co.helper;
        test.run(conn_str, argv);
    }
);