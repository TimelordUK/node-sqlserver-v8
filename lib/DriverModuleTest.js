"use strict";
const MsNodeSqWrapperModule_1 = require('./MsNodeSqWrapperModule');
let url = 'Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#8CFEB1E3\\tsql\\query;Trusted_Connection=yes;';
let sql = new MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.Sql();
sql.open(url).then(c => {
    console.log('opened');
    let command = c.Command();
    command.sql('select 1+1 as v, GETDATE() as d');
    command.onMeta((meta) => {
        console.log(`onMeta: ${JSON.stringify(meta, null, 2)}`);
    }).onColumn((col, data, more) => {
        console.log(`onColumn: more = ${more} data = ${JSON.stringify(data, null, 2)}`);
    }).onRowCount(count => {
        console.log(`onRowCount: ${count}`);
    }).onRow(r => {
        console.log(`onRow: row = ${JSON.stringify(r, null, 2)}`);
    }).onDone(() => {
        console.log(`onDone:`);
    }).rawFormat().Execute().then((res) => {
        console.log('==============================');
        console.log(JSON.stringify(res, null, 2));
    }).catch((e) => {
        console.log(e.error);
    });
}).catch(e => {
    console.log(e);
});
//# sourceMappingURL=DriverModuleTest.js.map