
const chai = require('chai')
const assert = chai.assert
const expect = chai.expect

describe('query', function () {
    this.timeout(40000)

    let connection = null
    const sql = require('msnodesqlv8')
    this.beforeEach(done => {
        connection = new sql.Connection()
        connection.open("Driver={ODBC Driver 17 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#", (err, conn) => {
            done(err)
        })
    })

    this.afterEach(done => {
        if (connection) {
            connection.close()
        }
        done()
    })

    it('executes a simple query', done => {
        connection.query("SELECT 1 AS Value", (err, result) => {
            if (err) return done(err)

            console.log("Query result:", result)
            // Assertions
            assert.isObject(result)
            assert.isArray(result.meta)
            assert.isArray(result.rows)
            assert.equal(result.rows.length, 1)
            assert.equal(result.rows[0][0], "1")
            done()
        })
    })

    it('handles query parameters', done => {
        connection.query("SELECT ? AS Value", [42], (err, result) => {
            if (err) return done(err)

            console.log("Query with param result:", result)
            // Assertions
            assert.equal(result.rows[0][0], "42")
            done()
        })
    })
})