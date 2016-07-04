@echo off
echo start > ./test.txt
for /L %%n in (1,1,100) do node test\runtests.js >> ./test.txt 2>&1