"use strict";
const MsNodeSqWrapperModule_1 = require('./MsNodeSqWrapperModule');
var QueryOptions = MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.QueryOptions;
let url = 'Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#8CFEB1E3\\tsql\\query;Trusted_Connection=yes;';
let sql = new MsNodeSqWrapperModule_1.MsNodeSqlWrapperModule.Sql();
sql.open(url).then(c => {
    console.log('opened');
    let options = new QueryOptions();
    options.onMeta = (meta) => {
        console.log('onMeta = ' + JSON.stringify(meta, null, 2));
    };
    options.onColumn = (col, data, more) => {
        console.log('onColumn = ' + JSON.stringify(data, null, 2));
    };
    options.onRowCount = (count) => {
        console.log('onRowCount = ' + count);
    };
    options.onRow = (r) => {
        console.log('onRow = ' + JSON.stringify(r, null, 2));
    };
    c.query('select 1+1 as v, GETDATE() as d', options).then(r => {
    }).catch(e => {
        console.log(e);
    });
    c.queryRaw('select 1+1 as v, GETDATE() as d', options).then((r) => {
        console.log(JSON.stringify(r, null, 2));
    }).catch(e => {
        console.log(e);
    });
}).catch(e => {
    console.log(e);
});
//# sourceMappingURL=DriverModuleTest.js.map