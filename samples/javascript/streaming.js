const sql = require('msnodesqlv8')
const util = require('util')

const connectionString = 'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node; Database={master}; Trusted_Connection=Yes;'

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
    })

    q.on('submitted', (m) => {
      const elapsed = new Date() - d
      console.log(`submitted ${m.query_str} elapsed ${elapsed} ms`)
    })

    q.on('column', (index, data) => {
      currentRow[index] = data
      if (index === lastColumn) {
        currentRow = [metadata.length]
        rows.push(currentRow)
      }
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
  const promised = util.promisify(sql.open)
  const conn = await promised(connectionString)
  const d = new Date()
  const rows = await dispatch(conn, 'SELECT * FROM syscomments')
  const elapsed = new Date() - d
  console.log(`${rows.length} rows returned elapsed ${elapsed}`)
  return rows
}

run(connectionString).then(() => {
  console.log('finished')
}).catch(err => {
  console.log(err)
})
