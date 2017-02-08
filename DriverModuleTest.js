"use strict";
const MsNodeSqWrapperModule_1 = require('./lib/MsNodeSqWrapperModule');
let assert = require('assert');
let supp = require('./demo-support');
let ASQ = require('asynquence-contrib');
class eventHits {
}
class StoredProcedureDef {
    constructor(name, def) {
        this.name = name;
        this.def = def;
    }
}
class WrapperTest {
    constructor(debug) {
        this.debug = debug;
        this.legacy = MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.legacyDriver;
        this.getIntIntProcedure = new StoredProcedureDef('test_sp_get_int_int', "alter PROCEDURE <name>" +
            `(
    @num1 INT,
    @num2 INT,
    @num3 INT OUTPUT
    )
    AS
    BEGIN
       SET @num3 = @num1 + @num2
       RETURN 99;
    END`);
        this.bigIntProcedure = new StoredProcedureDef('bigint_test', "alter PROCEDURE <name>" +
            `(
            @a bigint = 0,
            @b bigint = 0 output
         )
        AS
        BEGIN
            set @b = @a
            select @b as b
        END`);
        this.expectedPrepared = [
            {
                "len": 4
            }
        ];
        this.testPrepare = `select len(convert(varchar, ?)) as len`;
        this.testSelect = `select 1+1 as v, convert(DATETIME, '2017-02-06') as d`;
        this.expectedRows = [
            {
                "v": 2,
                "d": new Date(Date.parse("Feb 06, 2017"))
            }
        ];
        this.expectedMeta = [
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
    }
    exec(done) {
        ASQ().promise(this.storedProcedure(this.bigIntProcedure, [1234567890], [0, 1234567890]))
            .then((done) => {
            console.log(`storedProcedure ${this.bigIntProcedure.name} completes. next....`);
            done();
        }).promise(this.storedProcedure(this.getIntIntProcedure, [1, 2], [99, 3]))
            .then((done) => {
            console.log(`storedProcedure ${this.getIntIntProcedure.name} completes. next....`);
            done();
        }).promise(this.execute())
            .then((done) => {
            console.log('execute completes next....');
            done();
        })
            .promise(this.prepare())
            .then((done) => {
            console.log('prepare completes next....');
            done();
        })
            .promise(this.eventSubscribe())
            .then((done) => {
            console.log('eventSubscribe completes next....');
            done();
        })
            .then(() => {
            done();
        }).or((e) => {
            console.log(e);
        });
    }
    run(done) {
        supp.GlobalConn.init(this.legacy, (co) => {
            this.conn_str = co.conn_str;
            this.sqlWrapper = new MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.Sql(this.conn_str);
            this.support = co.support;
            this.procedureHelper = new this.support.ProcedureHelper(this.conn_str);
            this.procedureHelper.setVerbose(false);
            this.helper = co.helper;
            this.parsedJSON = this.helper.getJSON();
            if (this.debug)
                console.log(this.conn_str);
            this.exec(done);
        });
    }
    storedProcedure(procedureDef, params, expected) {
        return new Promise((resolve, reject) => {
            ASQ()
                .then((done) => {
                this.sqlWrapper.open().then(connection => {
                    done(connection);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection) => {
                this.procedureHelper.createProcedure(procedureDef.name, procedureDef.def, function () {
                    done(connection);
                });
            })
                .then((done, connection) => {
                connection.getCommand().procedure(procedureDef.name).params(params).execute().then(res => {
                    assert.deepEqual(res.outputParams, expected, "results didn't match");
                    done(connection);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection) => {
                connection.close().then(() => {
                    done();
                }).catch((e) => {
                    reject(e);
                });
            })
                .then(() => {
                resolve();
            }).or((e) => {
                reject(e);
            });
        });
    }
    prepare() {
        return new Promise((resolve, reject) => {
            ASQ()
                .then((done) => {
                this.sqlWrapper.open().then(connection => {
                    done(connection);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection) => {
                connection.getCommand().sql(this.testPrepare).prepare().then(command => {
                    done(connection, command);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection, command) => {
                command.params([1000]).execute().then(res => {
                    assert.deepEqual(res.asObjects, this.expectedPrepared, "results didn't match");
                    done(connection, command);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection, command) => {
                command.freePrepared().then(() => {
                    done(connection);
                }).catch((e) => {
                    reject(e);
                });
            })
                .then((done, connection) => {
                connection.close().then(() => {
                    done();
                }).catch((e) => {
                    reject(e);
                });
            })
                .then(() => {
                resolve();
            }).or((e) => {
                reject(e);
            });
        });
    }
    execute() {
        return new Promise((resolve, reject) => {
            this.sqlWrapper.execute(this.testSelect).then(res => {
                assert.deepEqual(res.asObjects, this.expectedRows, "results didn't match");
                resolve();
            }).catch(e => reject(e));
        });
    }
    eventSubscribe() {
        return new Promise((resolve, reject) => {
            let inst = this;
            function runTest(c) {
                let command = c.getCommand();
                command.sql(inst.testSelect);
                let h = new eventHits();
                command.onMeta((meta) => {
                    if (inst.debug)
                        console.log(`onMeta: ${JSON.stringify(meta, null, 2)}`);
                    h.onMeta++;
                    assert.deepEqual(inst.expectedMeta, meta, "results didn't match");
                }).onColumn((col, data, more) => {
                    if (inst.debug)
                        console.log(`onColumn: more = ${more} data = ${JSON.stringify(data, null, 2)}`);
                    h.onColumn++;
                }).onRowCount(count => {
                    if (inst.debug)
                        console.log(`onRowCount: ${count}`);
                    h.onRowCount++;
                }).onRow(r => {
                    if (inst.debug)
                        console.log(`onRow: row = ${JSON.stringify(r, null, 2)}`);
                    h.onRow++;
                }).onDone(() => {
                    if (inst.debug)
                        console.log(`onDone:`);
                    h.onDone++;
                }).onClosed(() => {
                    if (inst.debug)
                        console.log(`onClose:`);
                    h.onClosed++;
                }).onError((e) => {
                    if (inst.debug)
                        console.log(`onError: e = ${JSON.stringify(e, null, 2)}`);
                    h.onError++;
                }).execute().then((res) => {
                    if (inst.debug)
                        console.log('==============================');
                    if (inst.debug)
                        console.log(JSON.stringify(res, null, 2));
                    assert.deepEqual(res.asObjects, inst.expectedRows, "results didn't match");
                    resolve();
                }).catch((e) => {
                    h.onError++;
                    if (inst.debug)
                        console.log(JSON.stringify(e, null, 2));
                    reject(e);
                });
            }
            this.sqlWrapper.open()
                .then(c => runTest(c)).catch(e => {
                console.log(e);
                reject(e);
            });
        });
    }
}
let wt = new WrapperTest(false);
wt.run(() => {
    console.log('done.');
});
//# sourceMappingURL=DriverModuleTest.js.map