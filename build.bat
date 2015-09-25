@echo off
FOR /F "delims=" %%i IN ('node -v') DO set node_ver=%%i
echo %node_ver%
call build_ia32.bat
call build_x64.bat
