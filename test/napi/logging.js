describe('logging', function () {
    it('can set log levels', function (done) {
        const sql = require('msnodesqlv8')

        // Test console logging
        sql.setLogLevel(4); // Debug level
        sql.enableConsoleLogging(true);

        // Test file logging
        sql.setLogFile('./sql_driver.log');

        // Create a connection to generate some logs
        const conn = new sql.Connection();
        conn.open("Driver={ODBC Driver 17 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#", (err, conn) => {
            // Log level test successful if logs appear in console/file
            done(err);
        });
    });
});