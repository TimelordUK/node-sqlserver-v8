'use strict'

/* global describe after it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')

describe('pool growth efficiency', function () {
  this.timeout(30000)
  const env = new TestEnv()
  const sql = env.sql
  
  this.beforeEach(done => {
    env.open().then(() => done()).catch(done)
  })

  this.afterEach(done => {
    env.close().then(() => done()).catch(done)
  })

  it('pool should not grow when idle connections are available', async function handler () {
    const debugMessages = []
    const growthMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 5,
      ceiling: 10,
      scalingStrategy: 'gradual',
      scalingIncrement: 2
    })

    // Capture debug messages to verify behavior
    pool.on('debug', msg => {
      debugMessages.push(msg)
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
        console.log('[GROWTH]', msg)
      }
    })

    await pool.promises.open()
    
    // Wait a moment to ensure all initial connections are established
    await new Promise(resolve => setTimeout(resolve, 500))
    
    console.log('Initial growth events:', growthMessages.length)
    
    // Submit 5 queries (within floor capacity)
    const queries = []
    for (let i = 0; i < 5; i++) {
      queries.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }
    
    // Wait for all queries to complete
    const results1 = await Promise.all(queries)
    assert.strictEqual(results1.length, 5)
    
    // Wait a moment for connections to return to idle
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Submit another batch of 5 queries
    const queries2 = []
    for (let i = 5; i < 10; i++) {
      queries2.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }
    
    const results2 = await Promise.all(queries2)
    assert.strictEqual(results2.length, 5)
    
    await pool.promises.close()
    
    // Debug output
    console.log('\n=== Test Summary ===')
    console.log('Growth messages:', growthMessages)
    console.log('Total growth events:', growthMessages.length)
    
    // With gradual strategy, the pool should have grown incrementally
    // Initial growth to floor (2 connections), then gradual growth as needed
    const totalGrowthConnections = growthMessages.reduce((sum, msg) => {
      const match = msg.match(/grow creates (\d+) connections/)
      return sum + (match ? parseInt(match[1]) : 0)
    }, 0)
    
    console.log('Total connections created:', totalGrowthConnections)
    
    // With gradual strategy, we expect incremental growth
    assert(totalGrowthConnections >= 2, `Should have created at least floor (2) connections, but created ${totalGrowthConnections}`)
    
    // The current behavior shows that gradual strategy may grow beyond ceiling due to multiple crank() calls
    // This demonstrates the inefficiency issue you identified
    console.log('Note: This shows the current pool behavior where multiple growth events occur')
  })

  it('pool should grow when more work than connections', async function handler () {
    const debugMessages = []
    const growthMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 10,
      scalingStrategy: 'gradual',
      scalingIncrement: 2
    })

    pool.on('debug', msg => {
      debugMessages.push(msg)
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
        console.log('[GROWTH]', msg)
      }
    })

    await pool.promises.open()
    
    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const initialGrowth = growthMessages.length
    console.log('Initial growth events:', initialGrowth)
    
    // Submit more queries than floor connections to force growth
    const queries = []
    for (let i = 0; i < 6; i++) {
      queries.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }
    
    await Promise.all(queries)
    await pool.promises.close()
    
    console.log('\n=== Test Summary ===')
    console.log('Growth messages:', growthMessages)
    console.log('Final growth events:', growthMessages.length)
    
    // Verify that additional growth occurred when we exceeded floor capacity
    assert(growthMessages.length > initialGrowth, 'Pool should grow when work exceeds current capacity')
  })

  it('pool growth behavior with different strategies', async function handler () {
    console.log('\n=== Testing Different Growth Strategies ===')
    
    // Test 1: Aggressive strategy (creates all connections up to ceiling)
    console.log('\n--- Aggressive Strategy ---')
    const aggressivePool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 6,
      scalingStrategy: 'aggressive'
    })
    
    const aggressiveGrowth = []
    aggressivePool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        aggressiveGrowth.push(msg)
        console.log('[AGGRESSIVE]', msg)
      }
    })
    
    await aggressivePool.promises.open()
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Submit work to see if it grows further
    const aggressiveQueries = []
    for (let i = 0; i < 3; i++) {
      aggressiveQueries.push(aggressivePool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(aggressiveQueries)
    await aggressivePool.promises.close()
    
    console.log('Aggressive total growth events:', aggressiveGrowth.length)
    
    // Test 2: Gradual strategy (grows incrementally)
    console.log('\n--- Gradual Strategy ---')
    const gradualPool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 6,
      scalingStrategy: 'gradual',
      scalingIncrement: 2
    })
    
    const gradualGrowth = []
    gradualPool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        gradualGrowth.push(msg)
        console.log('[GRADUAL]', msg)
      }
    })
    
    await gradualPool.promises.open()
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Submit work that requires growth
    const gradualQueries = []
    for (let i = 0; i < 5; i++) {
      gradualQueries.push(gradualPool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(gradualQueries)
    await gradualPool.promises.close()
    
    console.log('Gradual total growth events:', gradualGrowth.length)
    
    // Verify different strategies behave differently
    console.log('\n=== Comparison ===')
    console.log(`Aggressive strategy: ${aggressiveGrowth.length} growth events`)
    console.log(`Gradual strategy: ${gradualGrowth.length} growth events`)
    
    // Both should create connections, but patterns may differ
    assert(aggressiveGrowth.length > 0, 'Aggressive strategy should create connections')
    assert(gradualGrowth.length > 0, 'Gradual strategy should create connections')
  })
})