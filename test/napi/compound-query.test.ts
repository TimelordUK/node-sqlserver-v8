import { expect } from 'chai'
import { Connection } from '../../src'
import * as nativeModule from '../../src/module-bridge'
import { TestConnectionFactory } from '../common/test-connection-factory'
import { QueryBuilder } from 'msnodesqlv8/src/query-builder'
import logger, { Logger, LogLevel } from '../../src/logger'
import { QueryReader } from '../../src/query-reader'

// Set logging options
nativeModule.setLogLevel(5) // Debug level
nativeModule.enableConsoleLogging(true)
Logger.getInstance().setMinLevel(LogLevel.DEBUG)

describe('compound query', function () {
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

  it('query syscolumns, sysobjects', async function () {
    const sql = 'select * from node.sys.syscolumns; select * from node.sys.sysobjects'
    if (connection === null) return
    const res = await connection.promises.query(sql)
    const reader = new QueryReader(connection, res)
    const top = await reader.getAllRows()
    logger.info(JSON.stringify(top))
    const res2 = await connection.promises.nextResultSet(res.handle, 50) ?? {
      meta: [],
      handle: {
        connectionId: 0,
        statementId: 0
      },
      endOfRows: true,
      endOfResults: true
    } as nativeModule.QueryResult
    const reader2 = new QueryReader(connection, res2)
    const top2 = await reader2.getAllRows()
    logger.info(JSON.stringify(top2))
    console.log(res)
  })
})
