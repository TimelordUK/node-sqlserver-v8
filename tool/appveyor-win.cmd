SET MSSQL_VERSION=2017
call powershell tool\appveyor.ps1 SQL2017
call node --version
call .\node_modules\.bin\env-cmd -e appv-2017 node test\env\cmd-test -t benchmark --repeats=5 --delay=4500 2>&1 
call .\node_modules\.bin\env-cmd -e appv-2017 node test\env\cmd-test -t benchmark --table=syscolumns --repeats=5 --delay=5000 2>&1
call .\node_modules\.bin\env-cmd -e appv-2017 node_modules\.bin\mocha --ignore bcp 2>&1
call net stop MSSQL$SQL2017

SET MSSQL_VERSION=2014
call powershell tool\appveyor.ps1 SQL2014
call node --version
call .\node_modules\.bin\env-cmd -e appv-2014 node test\env\cmd-test -t benchmark --repeats=5 --delay=4500 2>&1 
call .\node_modules\.bin\env-cmd -e appv-2014 node test\env\cmd-test -t benchmark --table=syscolumns --repeats=5 --delay=5000 2>&1
call .\node_modules\.bin\env-cmd -e appv-2014 node_modules\.bin\mocha --ignore bcp 2>&1
call net stop MSSQL$SQL2014

SET MSSQL_VERSION=2016
call powershell tool\appveyor.ps1 SQL2016
call node --version
call .\node_modules\.bin\env-cmd -e appv-2016 node test\env\cmd-test -t benchmark --repeats=5 --delay=4500 2>&1 
call .\node_modules\.bin\env-cmd -e appv-2016 node test\env\cmd-test -t benchmark --table=syscolumns --repeats=5 --delay=5000 2>&1
call .\node_modules\.bin\env-cmd -e appv-2016 node_modules\.bin\mocha --ignore bcp 2>&1
call net stop MSSQL$SQL2016