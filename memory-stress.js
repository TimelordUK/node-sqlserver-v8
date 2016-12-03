/**
 * Created by Stephen on 12/3/2016.
 */
const msnodesqlv8 = require('msnodesqlv8');

msnodesqlv8.open('Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#22236B93\\tsql\\query;Trusted_Connection=yes;', (err, conn) => {
    if (err) {
        throw err;
    }
    setInterval(() => {
    conn.queryRaw('select 1+1', (err, results) => {
        if (err) {
            throw err;
        }
        console.log(results);
});
}, 100);
});
