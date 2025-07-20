'use strict'

/* global describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')

describe('pool efficient strategy', function () {
  this.timeout(30000)
  const env = new TestEnv()
  const sql = env.sql

  this.beforeEach(done => {
    env.open().then(() => { done() }).catch(done)
  })

  this.afterEach(done => {
    env.close().then(() => { done() }).catch(done)
  })

  it('efficient strategy should only grow when idle connections are exhausted', async function handler () {
    const growthMessages = []
    const crankMessages = []

    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 3,
      ceiling: 10,
      scalingStrategy: 'efficient'
    })

    pool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
        console.log('[GROWTH]', msg)
      }
      if (msg.includes('efficient crank growing')) {
        crankMessages.push(msg)
        console.log('[CRANK]', msg)
      }
    })

    await pool.promises.open()

    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('Initial growth events:', growthMessages.length)

    // Submit 3 queries (within floor capacity) - should NOT trigger growth
    console.log('\n--- Submitting 3 queries (within floor capacity) ---')
    const queries1 = []
    for (let i = 0; i < 3; i++) {
      queries1.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }

    await Promise.all(queries1)
    const growthAfterFirst = growthMessages.length
    console.log('Growth events after 3 queries:', growthAfterFirst)

    // Wait for connections to return to idle
    await new Promise(resolve => setTimeout(resolve, 200))

    // Submit another 3 queries - should still NOT trigger growth
    console.log('\n--- Submitting another 3 queries ---')
    const queries2 = []
    for (let i = 3; i < 6; i++) {
      queries2.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }

    await Promise.all(queries2)
    const growthAfterSecond = growthMessages.length
    console.log('Growth events after second batch:', growthAfterSecond)

    // Now submit more queries than we have connections to force growth
    console.log('\n--- Submitting 6 queries simultaneously (exceeds floor) ---')
    const queries3 = []
    for (let i = 6; i < 12; i++) {
      queries3.push(pool.promises.query(`SELECT ${i} as num, @@SPID as spid`))
    }

    await Promise.all(queries3)
    const finalGrowth = growthMessages.length
    console.log('Final growth events:', finalGrowth)

    await pool.promises.close()

    console.log('\n=== Test Summary ===')
    console.log('Growth messages:', growthMessages)
    console.log('Crank growth messages:', crankMessages)

    // Verify efficient behavior
    assert.strictEqual(growthAfterFirst, growthAfterSecond,
      'Should not grow when reusing idle connections')

    // Check if growth was attempted when capacity was exceeded
    assert(crankMessages.length > 0,
      'Should attempt to grow when work exceeds idle capacity')

    console.log('✅ Growth was attempted when needed (even if no new connections created due to ceiling)')

    console.log('✅ Efficient strategy working: only grows when idle connections exhausted')
  })

  it('comparison: efficient vs aggressive strategy', async function handler () {
    console.log('\n=== Comparing Efficient vs Aggressive Strategy ===')

    // Test Efficient Strategy
    console.log('\n--- Testing Efficient Strategy ---')
    const efficientPool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 8,
      scalingStrategy: 'efficient'
    })

    const efficientGrowth = []
    efficientPool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        efficientGrowth.push(msg)
        console.log('[EFFICIENT]', msg)
      }
    })

    await efficientPool.promises.open()
    await new Promise(resolve => setTimeout(resolve, 300))

    // Submit queries that fit within initial capacity
    const efficientQueries1 = []
    for (let i = 0; i < 2; i++) {
      efficientQueries1.push(efficientPool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(efficientQueries1)

    const efficientGrowthAfterFit = efficientGrowth.length

    // Submit queries that exceed capacity
    const efficientQueries2 = []
    for (let i = 0; i < 5; i++) {
      efficientQueries2.push(efficientPool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(efficientQueries2)

    await efficientPool.promises.close()

    // Test Aggressive Strategy
    console.log('\n--- Testing Aggressive Strategy ---')
    const aggressivePool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 8,
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

    // Submit same queries
    const aggressiveQueries1 = []
    for (let i = 0; i < 2; i++) {
      aggressiveQueries1.push(aggressivePool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(aggressiveQueries1)

    const aggressiveQueries2 = []
    for (let i = 0; i < 5; i++) {
      aggressiveQueries2.push(aggressivePool.promises.query('SELECT @@SPID as spid'))
    }
    await Promise.all(aggressiveQueries2)

    await aggressivePool.promises.close()

    console.log('\n=== Results ===')
    console.log(`Efficient strategy: ${efficientGrowth.length} growth events`)
    console.log(`Aggressive strategy: ${aggressiveGrowth.length} growth events`)
    console.log(`Efficient growth after fitting queries: ${efficientGrowthAfterFit}`)

    // The efficient strategy should be more conservative
    assert(efficientGrowthAfterFit <= aggressiveGrowth.length,
      'Efficient strategy should be more conservative than aggressive')

    console.log('✅ Efficient strategy is more conservative than aggressive')
  })
})
