import { Connection, Bcp, BcpOptions, BcpColumnBinding } from '../../src/index'
import { TestConnectionFactory } from '../common/test-connection-factory'

describe('BCP (Bulk Copy Protocol) Tests', () => {
  let connection: Connection
  let bcp: Bcp

  beforeEach(async () => {
    connection = TestConnectionFactory.createConnection()
    await connection.open()
    
    // Create test table
    await connection.query(`
      IF OBJECT_ID('dbo.BcpTestTable', 'U') IS NOT NULL
        DROP TABLE dbo.BcpTestTable
      
      CREATE TABLE dbo.BcpTestTable (
        Id INT PRIMARY KEY,
        Name NVARCHAR(50),
        Value FLOAT,
        CreatedDate DATETIME
      )
    `)
  })

  afterEach(async () => {
    // Clean up
    if (connection?.isOpen()) {
      await connection.query(`
        IF OBJECT_ID('dbo.BcpTestTable', 'U') IS NOT NULL
          DROP TABLE dbo.BcpTestTable
      `)
      await connection.close()
    }
  })

  it('should perform bulk insert with BCP', async () => {
    // Create BCP instance
    bcp = connection.createBcp()
    
    // Initialize BCP for the table
    const options: BcpOptions = {
      tableName: 'dbo.BcpTestTable'
    }
    
    const initResult = await bcp.init(options)
    expect(initResult).toBe(true)
    
    // Prepare test data
    const ids = [1, 2, 3, 4, 5]
    const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie']
    const values = [100.5, 200.75, 300.0, 400.25, 500.5]
    const dates = [
      new Date('2023-01-01'),
      new Date('2023-02-01'),
      new Date('2023-03-01'),
      new Date('2023-04-01'),
      new Date('2023-05-01')
    ]
    
    // Bind columns
    const bindings: BcpColumnBinding[] = [
      {
        columnNumber: 1,
        data: ids,
        indicators: new Array(ids.length).fill(0),
        sqlType: 4, // SQL_INTEGER
        bufferLength: 4
      },
      {
        columnNumber: 2,
        data: names,
        indicators: new Array(names.length).fill(0),
        sqlType: -9, // SQL_WVARCHAR
        bufferLength: 100
      },
      {
        columnNumber: 3,
        data: values,
        indicators: new Array(values.length).fill(0),
        sqlType: 8, // SQL_DOUBLE
        bufferLength: 8
      },
      {
        columnNumber: 4,
        data: dates,
        indicators: new Array(dates.length).fill(0),
        sqlType: 93, // SQL_TYPE_TIMESTAMP
        bufferLength: 16
      }
    ]
    
    for (const binding of bindings) {
      const bindResult = await bcp.bindColumn(binding)
      expect(bindResult).toBe(true)
    }
    
    // Execute bulk copy
    const result = await bcp.execute()
    expect(result.success).toBe(true)
    expect(result.message).toContain('Bulk copy completed')
    
    // Verify the data was inserted
    const verifyResult = await connection.query('SELECT COUNT(*) as count FROM dbo.BcpTestTable')
    expect(verifyResult.rows[0].count).toBe(5)
    
    // Verify actual data
    const dataResult = await connection.query(
      'SELECT * FROM dbo.BcpTestTable ORDER BY Id'
    )
    
    expect(dataResult.rows.length).toBe(5)
    expect(dataResult.rows[0].Name).toBe('John')
    expect(dataResult.rows[0].Value).toBe(100.5)
  })

  it('should handle BCP with NULL values', async () => {
    bcp = connection.createBcp()
    
    const options: BcpOptions = {
      tableName: 'dbo.BcpTestTable'
    }
    
    await bcp.init(options)
    
    // Data with some NULL values
    const ids = [10, 11, 12]
    const names = ['Test1', null, 'Test3']
    const values = [null, 999.9, 888.8]
    const dates = [new Date(), null, new Date()]
    
    // Indicators: 0 for non-null, -1 for null
    const bindings: BcpColumnBinding[] = [
      {
        columnNumber: 1,
        data: ids,
        indicators: [0, 0, 0],
        sqlType: 4,
        bufferLength: 4
      },
      {
        columnNumber: 2,
        data: names,
        indicators: [0, -1, 0], // null for second row
        sqlType: -9,
        bufferLength: 100
      },
      {
        columnNumber: 3,
        data: values,
        indicators: [-1, 0, 0], // null for first row
        sqlType: 8,
        bufferLength: 8
      },
      {
        columnNumber: 4,
        data: dates,
        indicators: [0, -1, 0], // null for second row
        sqlType: 93,
        bufferLength: 16
      }
    ]
    
    for (const binding of bindings) {
      await bcp.bindColumn(binding)
    }
    
    const result = await bcp.execute()
    expect(result.success).toBe(true)
    
    // Verify NULL values were inserted correctly
    const dataResult = await connection.query(
      'SELECT * FROM dbo.BcpTestTable WHERE Id >= 10 ORDER BY Id'
    )
    
    expect(dataResult.rows[0].Name).toBe('Test1')
    expect(dataResult.rows[0].Value).toBeNull()
    
    expect(dataResult.rows[1].Name).toBeNull()
    expect(dataResult.rows[1].Value).toBe(999.9)
    expect(dataResult.rows[1].CreatedDate).toBeNull()
  })
})