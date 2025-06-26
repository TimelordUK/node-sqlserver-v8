const sql = require('./lib/index')

// Example configurations for different scaling strategies

async function demonstrateScalingStrategies() {
  console.log('Pool Scaling Strategies Demo\n')
  
  // Configuration examples
  const configs = {
    aggressive: {
      connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=test;Trusted_Connection=Yes;',
      ceiling: 50,
      floor: 0,
      heartbeatSecs: 20,
      inactivityTimeoutSecs: 60,
      scalingStrategy: 'aggressive' // Default - creates all 50 connections at once
    },
    
    gradual: {
      connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=test;Trusted_Connection=Yes;',
      ceiling: 50,
      floor: 0,
      heartbeatSecs: 20,
      inactivityTimeoutSecs: 60,
      scalingStrategy: 'gradual',
      scalingIncrement: 5, // Creates 5 connections at a time
      scalingDelay: 100 // 100ms delay between each connection creation
    },
    
    exponential: {
      connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=test;Trusted_Connection=Yes;',
      ceiling: 50,
      floor: 1,
      heartbeatSecs: 20,
      inactivityTimeoutSecs: 60,
      scalingStrategy: 'exponential',
      scalingFactor: 1.5, // Grows by 50% each time (1->2->3->5->8->12->18->27->40->50)
      scalingDelay: 50 // 50ms delay between connections
    }
  }
  
  console.log('1. Aggressive Strategy (Original Behavior):')
  console.log('   - Creates all 50 connections immediately')
  console.log('   - Fastest startup but highest resource spike')
  console.log('   - Config:', JSON.stringify(configs.aggressive, null, 2))
  
  console.log('\n2. Gradual Strategy:')
  console.log('   - Creates connections in increments of 5')
  console.log('   - Smoother resource usage, more predictable')
  console.log('   - Takes longer to reach full capacity')
  console.log('   - Config:', JSON.stringify(configs.gradual, null, 2))
  
  console.log('\n3. Exponential Strategy:')
  console.log('   - Starts small and grows exponentially')
  console.log('   - Balances between speed and resource usage')
  console.log('   - Growth pattern: 1->2->3->5->8->12->18->27->40->50')
  console.log('   - Config:', JSON.stringify(configs.exponential, null, 2))
  
  console.log('\n\nUsage Example:')
  console.log(`
const pool = new sql.Pool(configs.gradual)

pool.on('debug', msg => console.log('Pool:', msg))

pool.open((err) => {
  if (err) {
    console.error('Failed to open pool:', err)
    return
  }
  
  // Pool will grow gradually as queries are executed
  pool.query('SELECT 1', (err, results) => {
    // ...
  })
})
`)

  console.log('\nKey Benefits:')
  console.log('- Gradual: Prevents connection storms, good for shared databases')
  console.log('- Exponential: Adapts to load quickly while avoiding initial spike')
  console.log('- Configurable delays: Prevents overwhelming the database server')
  console.log('- Maintains backward compatibility with aggressive as default')
}

demonstrateScalingStrategies()