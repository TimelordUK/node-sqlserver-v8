SET MSSQL_VERSION=2017
call powershell tool\appveyor.ps1 SQL2017
call node --version
call node unit.tests\cmd-test.js -a 2017 -t benchmark --repeats=5 --delay=4500 2>&1
call node unit.tests\cmd-test.js -a 2017 -t benchmark --table=syscolumns --delay=5000 --repeats=5 2>&1
call node runtest -a 2017 -t json -t sproc.js -t connection-pool -t pause -t concurrent -t multiple-errors -t geography -t tvp -t warnings.js -t compoundqueries.js -t querycancel.js -t txn.js -t datatypes.js -t params.js -t query.js -t querytimeout.js -t connect.js -t bulk.js -t prepared.js -t userbind.js -t dates.js 2>&1
call net stop MSSQL$SQL2017
SET MSSQL_VERSION=2012
call powershell tool\appveyor.ps1 SQL2012SP1
call node --version
call node unit.tests\cmd-test.js -a 2012SP1 -t benchmark --repeats=5 --delay=4500 2>&1
call node unit.tests\cmd-test.js -a 2012SP1 -t benchmark --table=syscolumns --delay=5000 --repeats=5 2>&1
call node runtest -a 2012SP1 -t json -t sproc.js -t connection-pool -t pause -t concurrent -t multiple-errors -t geography -t tvp -t warnings.js -t compoundqueries.js -t querycancel.js -t txn.js -t datatypes.js -t params.js -t query.js -t querytimeout.js -t connect.js -t bulk.js -t prepared.js -t userbind.js -t dates.js 2>&1
call net stop MSSQL$SQL2012SP1
SET MSSQL_VERSION=2014
call powershell tool\appveyor.ps1 SQL2014
call node --version
call node unit.tests\cmd-test.js -a 2014 -t benchmark --repeats=5 --delay=4500 2>&1
call node unit.tests\cmd-test.js -a 2014 -t benchmark --table=syscolumns --delay=5000 --repeats=5 2>&1
call node runtest -a 2014 -t json -t sproc.js -t connection-pool -t pause -t concurrent -t multiple-errors -t geography -t tvp -t warnings.js -t compoundqueries.js -t querycancel.js -t txn.js -t datatypes.js -t params.js -t query.js -t querytimeout.js -t connect.js -t bulk.js -t prepared.js -t userbind.js -t dates.js 2>&1
call net stop MSSQL$SQL2014
SET MSSQL_VERSION=2016
call powershell tool\appveyor.ps1 SQL2016
call node --version
call node unit.tests\cmd-test.js -a 2016 -t benchmark --repeats=5 --delay=4500 2>&1
call node unit.tests\cmd-test.js -a 2016 -t benchmark --table=syscolumns --delay=5000 --repeats=5 2>&1
call node runtest -a 2016 -t json -t sproc.js -t connection-pool -t pause -t concurrent -t multiple-errors -t geography -t tvp -t warnings.js -t compoundqueries.js -t querycancel.js -t txn.js -t datatypes.js -t params.js -t query.js -t querytimeout.js -t connect.js -t bulk.js -t prepared.js -t userbind.js -t dates.js 2>&1
call net stop MSSQL$SQL2016