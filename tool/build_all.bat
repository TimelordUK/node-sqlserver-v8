set path=%path%;%~dp0
rmdir "C:\Program Files\nodejs"
mklink /D "C:\Program Files\nodejs" "C:\Program Files\nodejs.6.x64"
call build.bat
call build-electron.bat

rmdir "C:\Program Files\nodejs"
mklink /D "C:\Program Files\nodejs" "C:\Program Files\nodejs.5.x64"
call build.bat

rmdir "C:\Program Files\nodejs"
mklink /D "C:\Program Files\nodejs" "C:\Program Files\nodejs.4.x64"
call build.bat

rmdir "C:\Program Files\nodejs"
mklink /D "C:\Program Files\nodejs" "C:\Program Files\nodejs.0.x64"
call build.bat
