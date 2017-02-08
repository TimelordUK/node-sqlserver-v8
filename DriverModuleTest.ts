/**
 * Created by admin on 19/01/2017.
 */

import {MsNodeSqlWrapperModule} from './lib/MsNodeSqWrapperModule'
import {MsNodeSqlDriverApiModule} from "./lib/MsNodeSqlDriverApiModule";
import v8Meta = MsNodeSqlDriverApiModule.v8Meta;
import v8RawData = MsNodeSqlDriverApiModule.v8RawData;
import CommandResponse = MsNodeSqlWrapperModule.SqlCommandResponse;
import v8driver = MsNodeSqlDriverApiModule.v8driver;
import Connection = MsNodeSqlWrapperModule.Connection;
import SqlCommand = MsNodeSqlWrapperModule.SqlCommand;
import SqlCommandResponse = MsNodeSqlWrapperModule.SqlCommandResponse;

let assert = require('assert');
let supp = require('./demo-support');
let ASQ = require('asynquence-contrib');

class eventHits {
    public onMeta: number;
    public onColumn: number;
    public onRowCount: number;
    public onRow: number;
    public onDone: number;
    public onClosed: number;
    public onError: number;
}

class WrapperTest {

    conn_str: string;
    support: any;
    procedureHelper: any;
    helper: any;
    parsedJSON: any;
    sqlWrapper: MsNodeSqlWrapperModule.Sql;
    legacy: v8driver = MsNodeSqlWrapperModule.legacyDriver;

    constructor(public debug: boolean) {
    }

    expectedPrepared: any = [
        {
            "len": 4
        }
    ];

    testPrepare: string = `select len(convert(varchar, ?)) as len`;
    testSelect: string = `select 1+1 as v, convert(DATETIME, '2017-02-06') as d`;
    expectedRows: any = [
        {
            "v": 2,
            "d": new Date(Date.parse("Feb 06, 2017"))
        }
    ];
    expectedMeta = [
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

    private exec(done: Function): void {

        ASQ().promise(this.prepare())
            .then(
                (done: Function) => {
                    console.log('prepare completes. next....');
                    done();
                }
            ).promise(this.execute())
            .then(
                (done: Function) => {
                    console.log('execute completes next....');
                    done();
                }
            )
            .promise(this.storedProcedure())
            .then(
                (done: Function) => {
                    console.log('storedProcedure completes next....');
                    done();
                }
            )
            .promise(this.eventSubscribe())
            .then(
                (done: Function) => {
                    console.log('eventSubscribe completes next....');
                    done();
                }
            )
            .then(() => {
                done();
            });
    }

    public run(done: Function) {
        supp.GlobalConn.init(this.legacy, (co: any) => {
                this.conn_str = co.conn_str;
                this.sqlWrapper = new MsNodeSqlWrapperModule.Sql(this.conn_str);
                this.support = co.support;
                this.procedureHelper = new this.support.ProcedureHelper(this.conn_str);
                this.procedureHelper.setVerbose(false);
                this.helper = co.helper;
                this.parsedJSON = this.helper.getJSON();
                if (this.debug) console.log(this.conn_str);
                this.exec(done);
            }
        );
    }

    private storedProcedure(): Promise<any> {

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
                        if (inst.debug) console.log('==============================');
                        if (inst.debug) console.log(JSON.stringify(res, null, 2));
                        c.close().then(() => {
                            if (inst.debug) console.log('closed - finished.');
                            resolve();
                        });
                    }).catch((e: any) => {
                        console.log(JSON.stringify(e, null, 2));
                        reject(e);
                    });
                });
            });
        });
    }

    private prepare(): Promise<any> {
        return new Promise((resolve, reject) => {
            ASQ()
                .then((done: Function) => {
                    this.sqlWrapper.open().then(connection => {
                        done(connection);
                    })
                })
                .then(((done: Function, connection: Connection) => {
                    connection.getCommand().sql(this.testPrepare).prepare().then(command => {
                        done(connection, command);
                    })
                }))
                .then(((done: Function, connection: Connection, command: SqlCommand) => {
                    command.params([1000]).execute().then(res => {
                        assert.deepEqual(res.asObjects, this.expectedPrepared, "results didn't match");
                        done(connection, command);
                    })
                }))
                .then(((done: Function, connection: Connection, command: SqlCommand) => {
                    command.freePrepared().then(() => {
                        done(connection);
                    })
                }))
                .then(((done: Function, connection: Connection) => {
                    connection.close().then(() => {
                        done();
                    })
                }))
                .then(() => {
                    resolve();
                }).or((e: any) => {
                reject(e);
            });
        });
    }

    private execute(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.sqlWrapper.execute(this.testSelect).then(res => {
                assert.deepEqual(res.asObjects, this.expectedRows, "results didn't match");
                resolve();
            }).catch(e => reject(e));
        });
    }

    private eventSubscribe(): Promise<any> {
        return new Promise((resolve, reject) => {
            let inst = this;

            function runTest(c: Connection) {
                let command = c.getCommand();
                command.sql(inst.testSelect);
                let h = new eventHits();

                command.onMeta((meta: v8Meta) => {
                    if (inst.debug) console.log(`onMeta: ${JSON.stringify(meta, null, 2)}`);
                    h.onMeta++;
                    assert.deepEqual(inst.expectedMeta, meta, "results didn't match");
                }).onColumn((col, data, more) => {
                    if (inst.debug) console.log(`onColumn: more = ${more} data = ${JSON.stringify(data, null, 2)}`);
                    h.onColumn++;
                }).onRowCount(count => {
                    if (inst.debug) console.log(`onRowCount: ${count}`);
                    h.onRowCount++;
                }).onRow(r => {
                    if (inst.debug) console.log(`onRow: row = ${JSON.stringify(r, null, 2)}`);
                    h.onRow++;
                }).onDone(() => {
                    if (inst.debug) console.log(`onDone:`);
                    h.onDone++;
                }).onClosed(() => {
                    if (inst.debug) console.log(`onClose:`);
                    h.onClosed++;
                }).onError((e: any) => {
                    if (inst.debug) console.log(`onError: e = ${JSON.stringify(e, null, 2)}`);
                    h.onError++;
                }).execute().then((res: CommandResponse) => {
                    if (inst.debug) console.log('==============================');
                    if (inst.debug) console.log(JSON.stringify(res, null, 2));
                    assert.deepEqual(res.asObjects, inst.expectedRows, "results didn't match");
                    resolve();
                }).catch((e: CommandResponse) => {
                    h.onError++;
                    if (inst.debug) console.log(JSON.stringify(e, null, 2));
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



