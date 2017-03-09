/**
 * Created by Stephen on 12/3/2016.
 */
const msnodesqlv8 = require('msnodesqlv8');

msnodesqlv8.open('Driver={SQL Server Native Client 11.0};Server=np:\\\\.\\pipe\\LOCALDB#374B0D71\\tsql\\query;Trusted_Connection=yes;', (err, conn) => {
    if (err) {
        throw err;
    }
    setInterval(() => {
        let query = `RAISERROR('User JS Error', 9, 1);SELECT 1+1;`;

        conn.queryRaw(query, (err, results, more) => {
            console.log(">> queryRaw");
            console.log(err);
            console.log(JSON.stringify(results, null, 2));
            if (more) return;
            conn.queryRaw(query, (e, r) => {
                console.log(">> queryRaw2");
                console.log(e);
                console.log(JSON.stringify(r, null, 2));
                console.log("<< queryRaw2");
            });
            console.log("<< queryRaw");
        });
    }, 5000);
});
