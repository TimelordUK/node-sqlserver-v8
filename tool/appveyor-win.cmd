SET MSSQL_VERSION=2019

call powershell tool\appveyor.ps1 SQL2019
call node --version
call .\node_modules\.bin\env-cmd -e appv-2019 npm run bench-comments
call .\node_modules\.bin\env-cmd -e appv-2019 npm run bench-columns
call .\node_modules\.bin\env-cmd -e appv-v17-2019 npm run test
call .\node_modules\.bin\env-cmd -e appv-2019 npm run test
call net stop MSSQL$SQL2019

SET MSSQL_VERSION=2017

call powershell tool\appveyor.ps1 SQL2017
call node --version
call .\node_modules\.bin\env-cmd -e appv-2017 npm run bench-comments
call .\node_modules\.bin\env-cmd -e appv-2017 npm run bench-columns
call .\node_modules\.bin\env-cmd -e appv-v17-2017 npm run test
call .\node_modules\.bin\env-cmd -e appv-2017 npm run test
call net stop MSSQL$SQL2017
