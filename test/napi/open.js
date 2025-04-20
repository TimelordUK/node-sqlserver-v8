describe('open', function () {
    this.timeout(40000)

    this.beforeEach(done => {
        done()
    })

    this.afterEach(done => {
        done()
    })

    it('will call open on the cpp object', done => {
        const sql = require('msnodesqlv8')
        const conn = new sql.Connection()
        conn.open("Driver={ODBC Driver 18 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#;TrustServerCertificate=yes;", (err, conn) => {
            console.log("conn open")
            done(err)
        })
    })
})