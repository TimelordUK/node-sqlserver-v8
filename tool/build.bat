set path=%path%;%~dp0
@echo off
copy bindingdotgyp.old binding.gyp
call build_arch.bat node x64
call build_arch.bat node ia32