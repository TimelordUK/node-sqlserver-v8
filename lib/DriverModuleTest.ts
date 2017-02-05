/**
 * Created by admin on 19/01/2017.
 */

import {MsNodeSqlWrapperModule} from './MsNodeSqWrapperModule'
import v8Meta = MsNodeSqlDriverApiModule.v8Meta;
import {MsNodeSqlDriverApiModule} from "./MsNodeSqlDriverApiModule";
import v8RawData = MsNodeSqlDriverApiModule.v8RawData;
import CommandResponse = MsNodeSqlWrapperModule.CommandResponse;

let url = 'Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#8CFEB1E3\\tsql\\query;Trusted_Connection=yes;';
let sql = new MsNodeSqlWrapperModule.Sql();

sql.open(url).then(c => {
    console.log('opened');
    let command = c.Command();
    command.sql('select 1+1 as v, GETDATE() as d');

    command.onMeta((meta: v8Meta) => {
        console.log(`onMeta: ${JSON.stringify(meta, null, 2)}`);
    }).onColumn((col, data, more) => {
        console.log(`onColumn: more = ${more} data = ${JSON.stringify(data, null, 2)}`);
    }).onRowCount(count => {
        console.log(`onRowCount: ${count}`);
    }).onRow(r => {
        console.log(`onRow: row = ${JSON.stringify(r, null, 2)}`);
    }).Execute().then((res : CommandResponse) => {
        console.log('==============================')
        console.log(JSON.stringify(res.objects, null, 2));
    }).catch((e : CommandResponse)=> {
        console.log(e.error);
    });
}).catch(e => {
    console.log(e);
});

