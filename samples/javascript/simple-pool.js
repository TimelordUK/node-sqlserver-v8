const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

process.on('uncaughtException', err => {
  console.error('There was an uncaught error', err)
  process.exit(1) // mandatory (as per the Node.js docs)
})

async function run (iterations) {
  const pool = new env.sql.Pool({
    connectionString
  })

  pool.on('error', err => {
    console.error('pool error was an uncaught error', err)
  })
  await pool.promises.open()

  const testSql = 'select a;'
  for (let i = 0; i < iterations; ++i) {
    try {
      await pool.promises.query(testSql)
    } catch (e) {
      console.error('error', e)
    }
  }

  await pool.promises.close()
}

run(4).then(() => {
  console.log('exit.')
})
