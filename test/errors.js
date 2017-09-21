const sql = require('msnodesqlv8');
const config = {
  driver: 'SQL Server Native Client 11.0',
  user: 'username',
  password: 'password',
  server: '1.1.1.1',
  port: 1433,
  database: 'dbname'
}
const connStr = `Driver={SQL Server Native Client 11.0}; Server=np:\\\\.\\pipe\\LOCALDB#25686E23\\tsql\\query; Database={scratch}; Trusted_Connection=Yes;`

var joinFailTestQry = `
    SELECT tmp.*
    FROM (
        SELECT 1 [id], 'test1' [value]
        UNION ALL select 2, 'test2'
    ) tmp
    INNER MERGE JOIN (
        SELECT 1 [id2],'jointest1' [value2]
        UNION ALL select 2, 'jointest2'
    ) tmp2 ON tmp.id = tmp2.id2
    OPTION (RECOMPILE);`


var nullEliminatedTestQry = `
    SELECT
        SUM(tmp.[A])
    FROM (
        SELECT 1 [A], 2 [B], 3 [C]
        UNION ALL SELECT NULL, 5, 6
        UNION ALL SELECT 7, NULL, NULL
    ) as tmp
    OPTION (RECOMPILE);`

function testQry(cs,qry,testName) {
  sql.open(cs, function (err, conn) {
    const stmt = conn.queryRaw(qry)
    if(err){console.log(err)}
    stmt.on('error', function (err) {
      console.log(testName, err)
    })
  })
}

function testPrepared(cs,qry,testName){
  sql.open(cs, function (err, conn) {
    if (err) {console.log(testName, err)}
    conn.prepare(qry, function (e, ps) {
      ps.preparedQuery([1], function (err, fetched) {
        if(err){console.log(err)}
        ps.free(function () {})
      })
    })
  })
}

function testSP(cs,testName){
  sql.open(cs, function (err, conn) {
    if (err) {console.log(testName, err)}
    const pm = conn.procedureMgr()
    const sp = pm.callproc('tstWarning', ()=>{})
    sp.on('error',function(err){console.log(testName, err)})
  })
}

testQry(connStr,joinFailTestQry,'TEST ONE - Query - JOIN HINT WARNING')
testQry(connStr,nullEliminatedTestQry,'TEST TWO - Query - NULL ELIMNATED WARNING')
testPrepared(connStr,joinFailTestQry,'TEST THREE - Prepared Query - JOIN HINT WARNING')
testPrepared(connStr,nullEliminatedTestQry,'TEST FOUR - Prepared Query - NULL ELIMNATED WARNING')
testSP(connStr,'TEST FIVE - Stord Proc - JOIN HINT WARNING')