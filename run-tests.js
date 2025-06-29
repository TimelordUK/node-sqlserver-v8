const Mocha = require('mocha');
const path = require('path');
const fs = require('fs');
require('ts-node/register');

// Create the mocha instance
const mocha = new Mocha({
  timeout: 5000
});

// Get all test files
const testDir = path.join(__dirname, 'test');

function findTests(dir) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findTests(filePath);
    } else if (file.endsWith('.test.ts')) {
      console.log(`Adding test file: ${filePath}`);
      mocha.addFile(filePath);
    }
  });
}

findTests(testDir);

// Run the tests
mocha.run(failures => {
  process.exitCode = failures ? 1 : 0;
});