describe('open', function () {
    this.timeout(40000)

    this.beforeEach(done => {
        done()
    })

    this.afterEach(done => {
        done()
    })

    it('will call open on the cpp object', done => {
        const fn = __dirname
        const sqlserver = require('../../build/Debug/sqlserver')
        const conn = new sqlserver.Connection()
        conn.open("Driver={ODBC Driver 17 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#", (err, conn) => {
            console.log("conn open")
            done(err)
        })
    })
})