"use strict";
const MsNodeSqWrapperModule_1 = require('./MsNodeSqWrapperModule');
let url = 'Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#61BE4E3D\\tsql\\query;Trusted_Connection=yes;';
let sql = new MsNodeSqWrapperModule_1.MsNodeSqlDriverV8.Sql();
sql.open(url).then(c => {
    console.log('opened');
    c.queryRaw('select 1+1 as v').then(r => {
        console.log(r.object_vec);
    }).catch(e => {
        console.log(e);
    });
}).catch(e => {
    console.log(e);
});
//# sourceMappingURL=DriverModuleTest.js.map