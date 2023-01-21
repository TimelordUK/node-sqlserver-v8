const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()

function dispatch (con, query) {
  return new Promise((resolve, reject) => {
    let metadata = null
    let currentRow = null
    let lastColumn = 0
    const d = new Date()
    const q = con.query(query)
    const rows = []

    q.on('meta', (meta) => {
      metadata = meta
      currentRow = [metadata.length]
      lastColumn = metadata.length - 1
      console.log(`meta = ${JSON.stringify(meta, null, 4)}`)
    })

    q.on('submitted', (m) => {
      const elapsed = new Date() - d
      console.log(`submitted ${m.query_str} elapsed ${elapsed} ms`)
    })

    q.on('column', (index, data) => {
      console.log(`column [${index}] = ${JSON.stringify(data, null, 4)}`)
      currentRow[index] = data
      if (index === lastColumn) {
        currentRow = [metadata.length]
        rows.push(currentRow)
      }
    })

    q.on('row', (index) => {
      console.log(`row [${index}]`)
    })

    q.on('error', err => {
      reject(err)
    })

    q.on('info', i => {
      console.log(i)
    })

    q.on('done', () => {
      console.log('done')
      resolve(rows)
    })

    q.on('free', () => {
      console.log('free')
    })
  })
}

async function run () {
  await env.open()
  const connectionString = env.connectionString
  console.log(`run with ${connectionString}`)
  const conn = env.theConnection

  const query = env.connectionString.includes('Oracle')
    ? 'select * FROM user_tables'
    : 'select top 5 * from master..syscolumns'

  for (let i = 0; i < 5; ++i) {
    const d = new Date()
    const rows = await dispatch(conn, query)
    const elapsed = new Date() - d
    console.log(`${rows.length} rows returned elapsed ${elapsed}`)
  }

  await env.close()
  return []
}

run().then(() => {
  console.log('finished')
}).catch(err => {
  console.log(err)
})
