
import { expect } from 'chai';
import { Connection } from 'msnodesqlv8/src';
import * as nativeModule from 'msnodesqlv8';
import { TestConnectionFactory } from 'msnodesqlv8/test/common/test-connection-factory'
import { QueryBuilder } from 'msnodesqlv8/src/query-builder';

// Set logging options
nativeModule.setLogLevel(5); // Debug level
nativeModule.enableConsoleLogging(true)

describe('bind', function() {
  this.timeout(0)
  let connection: Connection | null = null;
  const factory = new TestConnectionFactory()

  beforeEach(async function() {
    // Create connection using the default connection string
    connection = await factory.createTestConnection()
  })

  afterEach(async function() {
    if (connection) {
      await connection.close()
    }
  })

  it('obtain the schema for a given table', async function() {
    const query = QueryBuilder.buildQuery({
      catalog: 'node',
      schema: 'dbo',
      table: 'Employee',
    })
    const sql = query.sql
    console.log(sql)
    expect(connection).not.to.be.null
    if (connection === null) return
    const res = await connection.query(sql)
    console.log(res)

  })
})
