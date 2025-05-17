import { expect } from 'chai'
import { Connection } from '../../src'
import { TestConnectionFactory } from '../common/test-connection-factory'
import { QueryBuilder } from 'msnodesqlv8/src/query-builder'
import { QueryReader } from '../../src/query-reader'
import { logger, LogLevel } from '../../src/logger-facade'

// Set logging options
logger.configureDevelopment({
  logLevel: LogLevel.DEBUG
})

describe('bind', function () {
  this.timeout(0)
  let connection: Connection
  const factory = new TestConnectionFactory()

  beforeEach(async function () {
    // Create connection using the default connection string
    connection = await factory.createTestConnection()
  })

  afterEach(async function () {
    if (connection) {
      await connection.promises.close()
    }
  })

  it('query syscolumns', async function () {
    const sql = 'select * from node.sys.syscolumns'
    if (connection === null) return
    const res = await connection.promises.submit(sql)
    const reader = new QueryReader(connection, res)
    const top = await reader.getAllRows()
    // logger.info(JSON.stringify(top))
    console.log(res)
  })

  it('obtain the schema for a given table', async function () {
    const query = QueryBuilder.buildQuery({
      catalog: 'node',
      schema: 'dbo',
      table: 'Employee'
    })
    const sql = query.sql
    if (connection === null) return
    const res = await connection.promises.submit(sql)
    const reader = new QueryReader(connection, res)
    const top = await reader.getAllRows()
    logger.info(JSON.stringify(top))
    console.log(res)
  })
})
