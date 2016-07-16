var Mocha = require('mocha');
var assert = require('assert');

runTest();

// set connection string in test-config.js

function runTest() {

    var mocha = new Mocha(
        {
            ui: 'tdd'
        });

    mocha.addFile('test/compoundqueries.js');

    mocha.run(function (failures) {
        process.on('uncaughtException', function (err) {
            console.log(err);
        });

        process.on('exit', function () {
            process.exit(failures);
        });
    });
}
