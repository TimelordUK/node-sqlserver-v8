var Mocha = require('mocha');

runTest();

// set connection string in test-config.js

function runTest() {

    var mocha = new Mocha(
        {
            ui : 'tdd'
        });

    mocha.addFile('test/params.js');

    mocha.run(function (failures) {
        process.on('uncaughtException', function (err) {
            console.log(err);
        });

        process.on('exit', function () {
            process.exit(failures);
        });
    });
}
