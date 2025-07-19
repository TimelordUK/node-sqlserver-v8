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
    const crankMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 10,
      ceiling: 20,
      heartbeatSecs: 1,
      inactivityTimeoutSecs: 10
    })

    // Capture debug messages to verify behavior
    pool.on('debug', msg => {
      debugMessages.push(msg)
      console.log('[DEBUG]', msg)
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
      }
      if (msg.includes('crank needs to grow pool')) {
        crankMessages.push(msg)
      }
    })

    await pool.promises.open()
    
    // Wait a moment to ensure all initial connections are established
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Submit 10 queries (matching the floor/initial connections)
    const queries = []
    for (let i = 0; i < 10; i++) {
      queries.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }
    
    // Wait for all queries to complete
    const results1 = await Promise.all(queries)
    assert.strictEqual(results1.length, 10)
    
    // Wait a moment for connections to return to idle
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Submit another batch of 10 queries
    const queries2 = []
    for (let i = 10; i < 20; i++) {
      queries2.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }
    
    const results2 = await Promise.all(queries2)
    assert.strictEqual(results2.length, 10)
    
    await pool.promises.close()
    
    // Debug output
    console.log('\n=== Test Summary ===')
    console.log('Growth messages:', growthMessages)
    console.log('Crank messages:', crankMessages)
    console.log('Total growth events:', growthMessages.length)
    console.log('Total crank growth requests:', crankMessages.length)
    
    // Verify behavior - the pool may grow in stages during initial open
    const totalGrowthConnections = growthMessages.reduce((sum, msg) => {
      const match = msg.match(/grow creates (\d+) connections/)
      return sum + (match ? parseInt(match[1]) : 0)
    }, 0)
    
    console.log('Total connections created:', totalGrowthConnections)
    
    // We expect the pool to create connections up to the floor (10)
    assert(totalGrowthConnections >= 10, `Should have created at least floor (10) connections, but created ${totalGrowthConnections}`)
    
    // The key test: after initial setup, no additional growth should occur
    // when we're just reusing idle connections
    assert.strictEqual(crankMessages.length, 0, 'Should not have needed to grow pool when idle connections were available')
  })

  it('pool should grow only when all connections are busy', async function handler () {
    const debugMessages = []
    const growthMessages = []
    const crankMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 10,
      scalingStrategy: 'gradual',
      scalingIncrement: 2
    })

    pool.on('debug', msg => {
      debugMessages.push(msg)
      console.log('[DEBUG]', msg)
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
      }
      if (msg.includes('crank needs to grow pool')) {
        crankMessages.push(msg)
      }
    })

    await pool.promises.open()
    
    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Submit queries that will hold connections busy
    const slowQueries = []
    for (let i = 0; i < 5; i++) {
      slowQueries.push(pool.promises.query("WAITFOR DELAY '00:00:01'; SELECT @@SPID as spid"))
    }
    
    // Give a moment for queries to start
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Wait for queries to complete
    await Promise.all(slowQueries)
    await pool.promises.close()
    
    console.log('\n=== Test Summary ===')
    console.log('Growth messages:', growthMessages)
    console.log('Crank growth messages:', crankMessages)
    
    // Verify that growth occurred when needed
    // We submitted 5 slow queries but only have 2 initial connections
    // So the pool should have grown
    assert(crankMessages.length > 0 || growthMessages.length > 1, 'Pool should grow when all connections are busy')
  })

  it('pool with burst workload should reuse connections efficiently', async function handler () {
    const spidsUsed = new Set()
    const debugMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 5,
      ceiling: 20
    })
    
    pool.on('debug', msg => {
      debugMessages.push(msg)
      if (msg.includes('checkout') || msg.includes('checkin') || msg.includes('grow')) {
        console.log('[DEBUG]', msg)
      }
    })

    await pool.promises.open()
    
    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Burst 1: Submit 5 queries
    console.log('\nBurst 1: 5 queries')
    const burst1 = []
    for (let i = 0; i < 5; i++) {
      burst1.push(pool.promises.query('SELECT @@SPID as spid'))
    }
    
    const results1 = await Promise.all(burst1)
    results1.forEach(r => spidsUsed.add(r.first[0].spid))
    console.log('SPIDs after burst 1:', Array.from(spidsUsed))
    
    // Wait for connections to return to idle
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Burst 2: Submit another 5 queries
    console.log('\nBurst 2: 5 queries')
    const burst2 = []
    for (let i = 0; i < 5; i++) {
      burst2.push(pool.promises.query('SELECT @@SPID as spid'))
    }
    
    const results2 = await Promise.all(burst2)
    const spidsBeforeBurst2 = spidsUsed.size
    results2.forEach(r => spidsUsed.add(r.first[0].spid))
    console.log('SPIDs after burst 2:', Array.from(spidsUsed))
    console.log('New SPIDs in burst 2:', spidsUsed.size - spidsBeforeBurst2)
    
    await pool.promises.close()
    
    // Verify that we reused connections (should have at most 5 unique SPIDs)
    console.log('\nUnique SPIDs used:', spidsUsed.size)
    assert(spidsUsed.size <= 5, `Should reuse connections efficiently, but used ${spidsUsed.size} unique connections`)
  })
})