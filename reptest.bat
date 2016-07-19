echo start > ./test.txt
for /L %%n in (1,1,100) do (
	node runtest.js -t params.js -t querytimeout.js -t connect.js -t bulk.js -t query.js -t sproc.js >> ./test.txt 2>&1
	echo "next " >> ./test.txt 2>&1
)