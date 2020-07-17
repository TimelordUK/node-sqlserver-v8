const sql = require('msnodesqlv8')
const util = require('util')

// const connectionString = 'Driver={SQL Server Native Client 17.0}; Server=192.168.56.1; database=node; Trusted_Connection=no; User Id=linux;Password=linux;'

const connectionString = 'Driver={SQL Server Native Client 17.0}; database=node; Server=192.168.56.1; UID=linux; PWD=linux'

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
  // const rows = await dispatch(conn, 'select @@SERVERNAME as server_name')
  // EXEC sys.sp_helpindex @objname = N'[users]'
  const rows = await dispatch(conn, `EXEC sys.sp_helpindex @objname = N'[users]'`)
  const elapsed = new Date() - d
  console.log(`${rows.length} rows returned elapsed ${elapsed}`)
  return rows
}

run(connectionString).then(() => {
  console.log('finished')
}).catch(err => {
  console.log(err)
})
