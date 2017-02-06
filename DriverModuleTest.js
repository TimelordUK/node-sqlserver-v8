"use strict";
const MsNodeSqWrapperModule_1 = require('./lib/MsNodeSqWrapperModule');
let assert = require('assert');
let supp = require('./demo-support');
class eventHits {
}
class WrapperTest {
    constructor(debug = false) {
        this.debug = debug;
        this.legacy = MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.legacyDriver;
    }
    run(done) {
        supp.GlobalConn.init(this.legacy, (co) => {
            this.conn_str = co.conn_str;
            this.sqlWrapper = new MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.Sql(this.conn_str);
            this.support = co.support;
            this.procedureHelper = new this.support.ProcedureHelper(this.conn_str);
            this.procedureHelper.setVerbose(false);
            let async = co.async;
            this.helper = co.helper;
            this.parsedJSON = this.helper.getJSON();
            if (this.debug)
                console.log(this.conn_str);
            this.exec(done);
        });
    }
    exec(done) {
        this.storedProcedure().then(() => {
            this.eventSubscribe().then(() => done()).
                catch(e => {
                console.log(JSON.stringify(e, null, 2));
            });
        }).catch(e => {
            console.log(JSON.stringify(e, null, 2));
        });
    }
    storedProcedure() {
        let sp_name = "test_sp_get_int_int";
        let def = "alter PROCEDURE <name>" +
            "(\n" +
            "@num1 INT,\n" +
            "@num2 INT,\n" +
            "@num3 INT OUTPUT\n" +
            "\n)" +
            "AS\n" +
            "BEGIN\n" +
            "   SET @num3 = @num1 + @num2\n" +
            "   RETURN 99;\n" +
            "END\n";
        return new Promise((resolve, reject) => {
            this.sqlWrapper.open().then(c => {
                if (this.debug) console.log('opened');
                let command = c.getCommand();
                let inst = this;
                this.procedureHelper.createProcedure(sp_name, def, function () {
                    command.procedure('test_sp_get_int_int').params([1, 2]).execute().then(res => {
                        let expected = [99, 3];
                        assert.deepEqual(res.outputParams, expected, "results didn't match");
                        if (inst.debug)
                            console.log('==============================');
                        if (inst.debug)
                            console.log(JSON.stringify(res, null, 2));
                        c.close().then(() => {
                            if (inst.debug)
                                console.log('closed - finished.');
                            resolve();
                        });
                    }).catch((e) => {
                        console.log(JSON.stringify(e, null, 2));
                        reject(e);
                    });
                });
            });
        });
    }
    eventSubscribe() {
        return new Promise((resolve, reject) => {
            this.sqlWrapper.open().then(c => {
                if (this.debug) console.log('opened');
                let command = c.getCommand();
                command.sql(`select 1+1 as v, convert(DATETIME, '2017-02-06') as d`);
                let h = new eventHits();
                let expectedMeta = [
                    {
                        "size": 10,
                        "name": "v",
                        "nullable": true,
                        "type": "number",
                        "sqlType": "int"
                    },
                    {
                        "size": 23,
                        "name": "d",
                        "nullable": true,
                        "type": "date",
                        "sqlType": "datetime"
                    }
                ];
                command.onMeta((meta) => {
                    if (this.debug)
                        console.log(`onMeta: ${JSON.stringify(meta, null, 2)}`);
                    h.onMeta++;
                    assert.deepEqual(expectedMeta, meta, "results didn't match");
                }).onColumn((col, data, more) => {
                    if (this.debug)
                        console.log(`onColumn: more = ${more} data = ${JSON.stringify(data, null, 2)}`);
                    h.onColumn++;
                }).onRowCount(count => {
                    if (this.debug)
                        console.log(`onRowCount: ${count}`);
                    h.onRowCount++;
                }).onRow(r => {
                    if (this.debug)
                        console.log(`onRow: row = ${JSON.stringify(r, null, 2)}`);
                    h.onRow++;
                }).onDone(() => {
                    if (this.debug)
                        console.log(`onDone:`);
                    h.onDone++;
                }).onClosed(() => {
                    if (this.debug)
                        console.log(`onClose:`);
                    h.onClosed++;
                }).onError((e) => {
                    if (this.debug)
                        console.log(`onError: e = ${JSON.stringify(e, null, 2)}`);
                    h.onError++;
                }).execute().then((res) => {
                    if (this.debug)
                        console.log('==============================');
                    if (this.debug)
                        console.log(JSON.stringify(res, null, 2));
                    let expected = [
                        {
                            "v": 2,
                            "d": new Date(Date.parse("Feb 06, 2017"))
                        }
                    ];
                    assert.deepEqual(res.asObjects, expected, "results didn't match");
                }).catch((e) => {
                    h.onError++;
                    if (this.debug)
                        console.log(JSON.stringify(e, null, 2));
                    reject(e);
                });
            }).catch(e => {
                console.log(e);
                reject(e);
            });
        });
    }
}
let wt = new WrapperTest();
wt.run(() => {
    console.log('done.');
});
//# sourceMappingURL=DriverModuleTest.js.map