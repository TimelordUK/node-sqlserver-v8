set path=%path%;%~dp0
@echo off
call build_arch.bat node x64
call build_arch.bat node ia32