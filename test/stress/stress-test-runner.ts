import * as sql from 'msnodesqlv8'
import * as os from 'os'

interface StressTestConfig {
  connectionString?: string
  iterations?: number
  reportInterval?: number
  gcInterval?: number
}

interface MemoryUsage {
  rss: string
  heapTotal: string
  heapUsed: string
  external: string
  arrayBuffers: string
}

interface TestError {
  iteration: number
  error: Error
}

interface TestScenario {
  name: string
  description: string
  execute: (conn: any, iteration: number) => Promise<void>
}

class StressTestRunner {
  private config: Required<StressTestConfig>
  private startTime: number | null = null
  private memoryBaseline: MemoryUsage | null = null
  private iterationCount = 0
  private errors: TestError[] = []
  private connection: any = null

  constructor(config: StressTestConfig = {}) {
    this.config = {
      connectionString: config.connectionString || process.env.CONNECTION_STRING || '',
      iterations: config.iterations || 10000,
      reportInterval: config.reportInterval || 1000,
      gcInterval: config.gcInterval || 5000
    }
  }

  private getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage()
    return {
      rss: (usage.rss / 1024 / 1024).toFixed(2),
      heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
      external: (usage.external / 1024 / 1024).toFixed(2),
      arrayBuffers: (usage.arrayBuffers / 1024 / 1024).toFixed(2)
    }
  }

  private logMemory(message = ''): void {
    const memory = this.getMemoryUsage()
    console.log(`[Memory] ${message}`)
    console.log(`  RSS: ${memory.rss} MB`)
    console.log(`  Heap Total: ${memory.heapTotal} MB`)
    console.log(`  Heap Used: ${memory.heapUsed} MB`)
    console.log(`  External: ${memory.external} MB`)
    console.log(`  Array Buffers: ${memory.arrayBuffers} MB`)
    
    if (this.memoryBaseline) {
      const heapDelta = (parseFloat(memory.heapUsed) - parseFloat(this.memoryBaseline.heapUsed)).toFixed(2)
      const rssDelta = (parseFloat(memory.rss) - parseFloat(this.memoryBaseline.rss)).toFixed(2)
      console.log(`  Heap Delta: ${parseFloat(heapDelta) > 0 ? '+' : ''}${heapDelta} MB`)
      console.log(`  RSS Delta: ${parseFloat(rssDelta) > 0 ? '+' : ''}${rssDelta} MB`)
    }
    console.log('')
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await sql.promises.open(this.config.connectionString)
      console.log('Connected to database')
    } catch (err) {
      console.error('Failed to connect:', err)
      throw err
    }
  }

  private async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.promises.close()
        console.log('Disconnected from database')
      } catch (err) {
        console.error('Failed to disconnect:', err)
      }
    }
  }

  private async setupTestTable(): Promise<void> {
    try {
      // Drop table if exists
      await this.connection.promises.query(`
        IF OBJECT_ID('dbo.stress_test_table', 'U') IS NOT NULL
          DROP TABLE dbo.stress_test_table
      `)

      // Create test table with various column types
      await this.connection.promises.query(`
        CREATE TABLE dbo.stress_test_table (
          id INT PRIMARY KEY,
          string_column NVARCHAR(MAX),
          binary_column VARBINARY(MAX),
          text_column TEXT,
          image_column IMAGE,
          small_string VARCHAR(255),
          small_binary VARBINARY(255)
        )
      `)

      // Insert test data
      const insertQuery = `
        INSERT INTO dbo.stress_test_table 
        (id, string_column, binary_column, text_column, image_column, small_string, small_binary)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `

      const largeString = 'x'.repeat(10000)
      const largeBuffer = Buffer.alloc(10000, 0xFF)
      const smallString = 'test string'
      const smallBuffer = Buffer.from('test binary')

      for (let i = 0; i < 100; i++) {
        await this.connection.promises.query(insertQuery, [
          i,
          largeString + i,
          largeBuffer,
          largeString + i,
          largeBuffer,
          smallString + i,
          smallBuffer
        ])
      }

      console.log('Test table created and populated')
    } catch (err) {
      console.error('Failed to setup test table:', err)
      throw err
    }
  }

  private async cleanupTestTable(): Promise<void> {
    try {
      await this.connection.promises.query(`
        IF OBJECT_ID('dbo.stress_test_table', 'U') IS NOT NULL
          DROP TABLE dbo.stress_test_table
      `)
      console.log('Test table cleaned up')
    } catch (err) {
      console.error('Failed to cleanup test table:', err)
    }
  }

  private async runScenario(scenario: TestScenario): Promise<void> {
    console.log(`\nRunning scenario: ${scenario.name}`)
    console.log(`Description: ${scenario.description}`)
    console.log(`Iterations: ${this.config.iterations}`)
    console.log('----------------------------------------')

    this.startTime = Date.now()
    this.iterationCount = 0
    this.errors = []
    
    // Force GC and record baseline memory
    if ((global as any).gc) {
      (global as any).gc()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    this.memoryBaseline = this.getMemoryUsage()
    this.logMemory('Baseline')

    // Run iterations
    for (let i = 0; i < this.config.iterations; i++) {
      try {
        await scenario.execute(this.connection, i)
        this.iterationCount++

        // Report progress
        if (i > 0 && i % this.config.reportInterval === 0) {
          const elapsed = (Date.now() - this.startTime) / 1000
          const rate = this.iterationCount / elapsed
          console.log(`Progress: ${i}/${this.config.iterations} iterations (${rate.toFixed(1)} ops/sec)`)
          this.logMemory(`After ${i} iterations`)
        }

        // Force GC periodically
        if ((global as any).gc && i > 0 && i % this.config.gcInterval === 0) {
          (global as any).gc()
          await new Promise(resolve => setTimeout(resolve, 10))
        }

      } catch (err) {
        this.errors.push({ iteration: i, error: err as Error })
        if (this.errors.length > 10) {
          console.error('Too many errors, stopping test')
          break
        }
      }
    }

    // Final report
    const totalTime = (Date.now() - this.startTime!) / 1000
    const rate = this.iterationCount / totalTime

    console.log('\n----------------------------------------')
    console.log(`Scenario completed: ${scenario.name}`)
    console.log(`Total iterations: ${this.iterationCount}`)
    console.log(`Total time: ${totalTime.toFixed(2)} seconds`)
    console.log(`Average rate: ${rate.toFixed(1)} operations/second`)
    console.log(`Errors: ${this.errors.length}`)
    
    if (this.errors.length > 0) {
      console.log('\nFirst few errors:')
      this.errors.slice(0, 3).forEach(({ iteration, error }) => {
        console.log(`  Iteration ${iteration}: ${error.message}`)
      })
    }

    // Force GC and final memory report
    if ((global as any).gc) {
      (global as any).gc()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    this.logMemory('Final')
  }

  async run(scenarioName: string): Promise<void> {
    try {
      await this.connect()
      await this.setupTestTable()

      const scenario = this.scenarios[scenarioName]
      if (!scenario) {
        console.error(`Unknown scenario: ${scenarioName}`)
        console.log('Available scenarios:', Object.keys(this.scenarios).join(', '))
        return
      }

      await this.runScenario(scenario)

    } catch (err) {
      console.error('Test failed:', err)
    } finally {
      await this.cleanupTestTable()
      await this.disconnect()
    }
  }

  // Define stress test scenarios
  private scenarios: Record<string, TestScenario> = {
    'string-select': {
      name: 'String Column Selection',
      description: 'Repeatedly select string columns to check for memory leaks',
      execute: async (conn, iteration) => {
        const query = 'SELECT id, string_column, small_string FROM stress_test_table'
        const results = await conn.promises.query(query)
        // Access the data to ensure it's materialized
        results.first.forEach((row: any) => {
          const _ = row.string_column
          const __ = row.small_string
        })
      }
    },

    'binary-select': {
      name: 'Binary Column Selection',
      description: 'Repeatedly select binary columns to check for memory leaks',
      execute: async (conn, iteration) => {
        const query = 'SELECT id, binary_column, small_binary FROM stress_test_table'
        const results = await conn.promises.query(query)
        // Access the data to ensure it's materialized
        results.first.forEach((row: any) => {
          const _ = row.binary_column
          const __ = row.small_binary
        })
      }
    },

    'mixed-select': {
      name: 'Mixed Column Selection',
      description: 'Select both string and binary columns together',
      execute: async (conn, iteration) => {
        const query = 'SELECT * FROM stress_test_table'
        const results = await conn.promises.query(query)
        // Access all columns
        results.first.forEach((row: any) => {
          Object.keys(row).forEach(key => {
            const _ = row[key]
          })
        })
      }
    },

    'large-text': {
      name: 'Large Text/Image Selection',
      description: 'Select TEXT and IMAGE columns (deprecated types)',
      execute: async (conn, iteration) => {
        const query = 'SELECT id, text_column, image_column FROM stress_test_table'
        const results = await conn.promises.query(query)
        results.first.forEach((row: any) => {
          const _ = row.text_column
          const __ = row.image_column
        })
      }
    },

    'parameter-binding': {
      name: 'Parameterized Query',
      description: 'Test parameter binding with string and binary data',
      execute: async (conn, iteration) => {
        const id = iteration % 100
        const query = 'SELECT * FROM stress_test_table WHERE id = ?'
        const results = await conn.promises.query(query, [id])
        if (results.first.length > 0) {
          const _ = results.first[0]
        }
      }
    },

    'streaming': {
      name: 'Streaming Results',
      description: 'Stream results row by row',
      execute: async (conn, iteration) => {
        return new Promise<void>((resolve, reject) => {
          const query = conn.query('SELECT * FROM stress_test_table')
          let rowCount = 0
          
          query.on('row', (row: any) => {
            rowCount++
            // Access the data
            const _ = row
          })
          
          query.on('done', () => resolve())
          query.on('error', reject)
        })
      }
    },

    'rapid-queries': {
      name: 'Rapid Small Queries',
      description: 'Execute many small queries in quick succession',
      execute: async (conn, iteration) => {
        // Execute 10 quick queries
        for (let i = 0; i < 10; i++) {
          const results = await conn.promises.query('SELECT 1 as test')
          const _ = results.first[0].test
        }
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Usage: node stress-test-runner.js <scenario> [options]')
    console.log('\nAvailable scenarios:')
    const runner = new StressTestRunner()
    Object.entries((runner as any).scenarios).forEach(([key, scenario]: [string, TestScenario]) => {
      console.log(`  ${key}: ${scenario.description}`)
    })
    console.log('\nOptions:')
    console.log('  --iterations <number>    Number of iterations (default: 10000)')
    console.log('  --report <number>        Report interval (default: 1000)')
    console.log('  --gc <number>            GC interval (default: 5000)')
    console.log('  --connection <string>    Connection string (or use CONNECTION_STRING env var)')
    console.log('\nExample:')
    console.log('  node --expose-gc stress-test-runner.js string-select --iterations 50000')
    process.exit(1)
  }

  const scenario = args[0]
  const config: StressTestConfig = {
    iterations: 10000,
    reportInterval: 1000,
    gcInterval: 5000
  }

  // Parse options
  for (let i = 1; i < args.length; i += 2) {
    const option = args[i]
    const value = args[i + 1]
    
    switch (option) {
      case '--iterations':
        config.iterations = parseInt(value, 10)
        break
      case '--report':
        config.reportInterval = parseInt(value, 10)
        break
      case '--gc':
        config.gcInterval = parseInt(value, 10)
        break
      case '--connection':
        config.connectionString = value
        break
    }
  }

  if (!config.connectionString && !process.env.CONNECTION_STRING) {
    console.error('Error: No connection string provided')
    console.error('Use --connection option or set CONNECTION_STRING environment variable')
    process.exit(1)
  }

  // Check if GC is exposed
  if (!(global as any).gc) {
    console.warn('Warning: GC not exposed. Run with --expose-gc flag for better memory tracking:')
    console.warn('  node --expose-gc stress-test-runner.js <scenario>')
    console.warn('')
  }

  const runner = new StressTestRunner(config)
  runner.run(scenario).then(() => {
    console.log('\nTest completed')
    process.exit(0)
  }).catch(err => {
    console.error('\nTest failed:', err)
    process.exit(1)
  })
}

export = StressTestRunner