echo start > ./test.txt
for /L %%n in (1,1,100) do (
	node runtest.js -t bulk.js -t query.js >> ./test.txt 2>&1
	echo "next " >> ./test.txt 2>&1
)