var Mocha = require('mocha');
var demo = require('./demo-support');

runTest();

function runTest() {
    var argv = require('minimist')(process.argv.slice(2));
    console.log(argv);

    var toRun;
    if (argv.hasOwnProperty('t')) {
        toRun = argv['t'];
    }

    if (!Array.isArray(toRun)) {
        toRun = [toRun];
    }

    run(toRun, function(e) {
        console.log(e);
        process.exit(e);
    });

    function run(files, done) {

        var mocha = new Mocha(
            {
                ui : 'tdd'
            }
        );

        files.forEach(function(f) {
            mocha.addFile('test/' + f);
        });

        mocha.run(function (failures) {
            process.on('uncaughtException', function (err) {
                console.log(err);
            });

            process.on('exit', function () {
                done(failures);
            });
        });
    }
}
