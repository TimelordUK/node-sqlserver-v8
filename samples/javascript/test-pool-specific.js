const sql = require('./lib/sql')
const { TestEnv } = require('./test/env/test-env')
const env = new TestEnv()

async function testPoolErrorQueries() {
  console.log('Starting test...')
  
  try {
    await env.open()
    console.log('Test environment opened')
    
    const size = 4
    const iterations = 4
    const pool = env.pool(size)
    
    const checkin = []
    const checkout = []
    const errors = []
    
    pool.on('error', e => {
      console.log('Pool error:', e.message)
      errors.push(e)
    })
    
    pool.on('debug', s => {
      console.log('Pool debug:', s)
    })
    
    pool.open()
    
    await new Promise((resolve, reject) => {
      pool.on('open', () => {
        console.log('Pool opened')
        
        pool.on('status', s => {
          console.log('Pool status:', s)
          switch (s.op) {
            case 'checkout':
              checkout.push(s)
              break
            case 'checkin':
              checkin.push(s)
              break
          }
        })
        
        let done = 0
        let free = 0
        let submissions = 0
        
        function submit(sql, index) {
          console.log(`Submitting query ${index}: ${sql}`)
          const q = pool.query(sql, (e, result, more) => {
            console.log(`Query ${index} callback called - error:`, e?.message, 'result:', !!result, 'more:', more)
            if (e) errors.push(e)
          })
          
          q.on('submitted', () => {
            ++submissions
            console.log(`Query submitted: ${submissions}`)
          })
          
          q.on('done', () => {
            ++done
            console.log(`Query done: ${done}`)
          })
          
          q.on('free', () => {
            ++free
            console.log(`Query free: ${free}`)
            if (free === iterations) {
              console.log('All queries freed, closing pool...')
              pool.close(() => {
                console.log(`Test complete: errors=${errors.length}, checkin=${checkin.length}, checkout=${checkout.length}`)
                if (errors.length === iterations && checkin.length === iterations && checkout.length === iterations) {
                  resolve()
                } else {
                  reject(new Error(`Expected ${iterations} of each, got errors=${errors.length}, checkin=${checkin.length}, checkout=${checkout.length}`))
                }
              })
            }
          })
          
          return q
        }
        
        const testSql = 'select a;'
        for (let i = 0; i < iterations; ++i) {
          submit(testSql, i)
        }
      })
    })
    
    console.log('Test passed!')
    await env.close()
    
  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }
}

testPoolErrorQueries()