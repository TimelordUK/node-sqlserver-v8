set path=%path%;%~dp0

call switch-ver 10
call build.bat

call switch-ver 9
call build.bat

call switch-ver 8
call build.bat

call switch-ver 7
call build.bat

call switch-ver 6
call build.bat
call build-electron.bat
call build-electron.bat

call switch-ver 5
call build.bat

call switch-ver 4
call build.bat
