'use strict'
// shared by the issue repros. MSNODESQLV8_ROOT picks another build (e.g. an older
// release installed elsewhere); MSSQL_CS overrides the connection string.
const path = require('path')
const { TestEnv } = require('../../env/test-env')
const root = process.env.MSNODESQLV8_ROOT || path.join(__dirname, '../../..')
const sql = require(root)
const cs = process.env.MSSQL_CS || new TestEnv().connectionString
module.exports = { sql, cs, version: require(path.join(root, 'package.json')).version }
