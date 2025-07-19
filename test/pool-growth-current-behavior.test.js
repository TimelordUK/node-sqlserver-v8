'use strict'

/* global describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')

describe('pool growth current behavior', function () {
  this.timeout(30000)
  const env = new TestEnv()
  const sql = env.sql
  
  this.beforeEach(done => {
    env.open().then(() => done()).catch(done)
  })

  this.afterEach(done => {
    env.close().then(() => done()).catch(done)
  })

  it('demonstrates current pool growth behavior', async function handler () {
    const growthMessages = []
    const checkoutMessages = []
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 10
    })

    pool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
        console.log('[GROWTH]', msg)
      }
      if (msg.includes('checkout')) {
        checkoutMessages.push(msg)
      }
    })

    await pool.promises.open()
    
    console.log('\n=== Initial State ===')
    console.log('Growth events after open:', growthMessages.length)
    
    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Submit 2 queries (matching floor)
    console.log('\n=== Submitting 2 queries (matching floor) ===')
    const queries1 = []
    for (let i = 0; i < 2; i++) {
      queries1.push(pool.promises.query(`SELECT ${i} as num`))
    }
    await Promise.all(queries1)
    
    console.log('Growth events after 2 queries:', growthMessages.length)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Submit 2 more queries
    console.log('\n=== Submitting 2 more queries ===')
    const queries2 = []
    for (let i = 2; i < 4; i++) {
      queries2.push(pool.promises.query(`SELECT ${i} as num`))
    }
    await Promise.all(queries2)
    
    console.log('Growth events after 4 total queries:', growthMessages.length)
    
    // Submit more queries than current connections
    console.log('\n=== Submitting 6 queries (exceeds current connections) ===')
    const queries3 = []
    for (let i = 4; i < 10; i++) {
      queries3.push(pool.promises.query(`SELECT ${i} as num`))
    }
    await Promise.all(queries3)
    
    console.log('Final growth events:', growthMessages.length)
    console.log('All growth messages:', growthMessages)
    
    await pool.promises.close()
    
    // Current behavior: pool grows eagerly even when idle connections exist
    console.log('\n=== Summary ===')
    console.log('The pool grew', growthMessages.length, 'times')
    console.log('This demonstrates that the pool currently grows eagerly')
    console.log('even when there might be idle connections available')
  })

  it('shows pool behavior with scaling strategies', async function handler () {
    console.log('\n=== Testing Gradual Scaling Strategy ===')
    
    const pool = new sql.Pool({
      connectionString: env.connectionString,
      floor: 2,
      ceiling: 10,
      scalingStrategy: 'gradual',
      scalingIncrement: 2
    })

    const growthMessages = []
    pool.on('debug', msg => {
      if (msg.includes('grow creates')) {
        growthMessages.push(msg)
        console.log('[GROWTH]', msg)
      }
    })

    await pool.promises.open()
    
    // Submit many queries at once
    const queries = []
    for (let i = 0; i < 8; i++) {
      queries.push(pool.promises.query(`SELECT ${i} as num`))
    }
    
    await Promise.all(queries)
    await pool.promises.close()
    
    console.log('\nTotal growth events:', growthMessages.length)
    console.log('With gradual strategy, pool grows in increments of', 2)
  })
})