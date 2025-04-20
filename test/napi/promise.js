'use strict'

const chai = require('chai')
const assert = chai.assert
const sql = require('msnodesqlv8')
sql.setLogLevel(4); // Debug level
sql.enableConsoleLogging(true);
const connectionConfig = require('../common/connection-config')

describe('promise',  () => {
    it('use a promise to open close a connection', async () => {
        const cs = connectionConfig.getConnectionString()
        const connection = new sql.Connection()
        const c = await connection.promises.open(cs)
        assert(c !== null)
        await  connection.promises.close()
    })
})