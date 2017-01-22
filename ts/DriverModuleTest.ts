/**
 * Created by admin on 19/01/2017.
 */

import {MsNodeSqlDriverV8} from './MsNodeSqWrapperModule'
let url = 'Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#61BE4E3D\\tsql\\query;Trusted_Connection=yes;';
let sql = new MsNodeSqlDriverV8.Sql();
sql.open(url).then(c => {
   console.log('opened');
    c.queryRaw('select 1+1 as v').then(r=> {
        console.log(r.object_vec);
    }).catch(e=> {
        console.log(e);
    })
}).catch(e=> {
   console.log(e);
});

