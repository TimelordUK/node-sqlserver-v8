// Debug script to show array parameter processing
const { SqlParameter, IntegerArrayParameter } = require('./lib/sql-parameter');

console.log('Array Parameter Debug Info\n');

// Create an array parameter using the normalizeParams method
const testArray = [0x80, 0x8000, 0x800000, 0x80000000];
console.log('Input array:', testArray);

// Create parameter directly
const arrayParam = new IntegerArrayParameter(testArray);
const normalized = [arrayParam];
console.log('\nNormalized parameters:', normalized.length);

normalized.forEach((param, index) => {
    console.log(`\nParameter ${index}:`);
    console.log('- Type:', param.type);
    console.log('- Element Type:', param.elementType);
    console.log('- SQL Type:', param.sqlType);
    console.log('- C Type:', param.cType);
    console.log('- Is Array:', param.isArray);
    console.log('- Value Length:', Array.isArray(param.value) ? param.value.length : 'N/A');
    console.log('- Precision:', param.precision);
    console.log('- Param Size:', param.paramSize);
    console.log('- Buffer Length:', param.bufferLen);
});

console.log('\nKey points:');
console.log('1. isArray flag is set to true');
console.log('2. The value contains all 4 array elements');
console.log('3. SQL type is SQL_BIGINT due to the large value 0x80000000');
console.log('4. Buffer length accounts for all 4 elements (8 bytes * 4 = 32 bytes)');
console.log('\nThe C++ code will now:');
console.log('- Detect isArray=true and array_length=4');
console.log('- Call SQLSetStmtAttr with SQL_ATTR_PARAMSET_SIZE=4');
console.log('- This tells ODBC to insert 4 rows, one for each array element');