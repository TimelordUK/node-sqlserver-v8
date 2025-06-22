const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()

main().then(() => {
  console.log('done')
}).catch(err => { console.log(err) })

async function main () {
  const connectionString = env.connectionString
  try {
    const con = await env.sql.promises.open(connectionString)
    await asStream((con))
    await con.promises.close()
  } catch (err) {
    if (err) {
      if (Array.isArray(err)) {
        err.forEach((e) => {
          console.log(e.message)
        })
      } else {
        console.log(err.message)
      }
    }
  }
}

// create a long running task e.g. use batch for web call
async function dispatch (batch) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(null)
    }, 1500, batch)
  })
}

async function asStream (con) {
  return new Promise((resolve, reject) => {
    const sql = 'select top 750 * from master..syscolumns;'
    console.log('stream fetch query with throttle back to server to slow results')
    const q = con.query(sql)
    const errors = []
    let row = null
    let meta = null
    const rowsPerBatch = 100
    let batch = []
    let rowCount = 0
    let batchIndex = 0

    q.on('submitted', q => {
      console.log(`on.submitted ${q.query_str}`)
    })

    q.on('error', (err, more) => {
      if (more) {
        errors.push(err)
      } else {
        const msg = errors.map(e => e.message).join(', ')
        reject(new Error(msg))
      }
    })

    q.on('meta', (m) => {
      meta = m
    })

    // start of row so create a new array and store for later
    q.on('row', () => {
      ++rowCount
      row = [meta.length]
      batch.push(row)
    })

    function next () {
      const d = new Date()
      const ts = d.toLocaleTimeString()
      console.log(`${ts} - [${batchIndex}] (rowCount ${rowCount}): pause and dispatch ${batch.length} rows ...`)
      q.pauseQuery()
      dispatch(batch).then(() => {
        console.log(`${ts} - [${batchIndex}] (rowCount ${rowCount}): ... done, resume query`)
        batchIndex++
        batch = []
        q.resumeQuery()
      })
    }

    q.on('column', (c, d) => {
      const last = meta.length - 1
      row[c] = d
      if (c === last && batch.length === rowsPerBatch) {
        next()
      }
    })

    q.on('done', () => {
      console.log('on.done')
      if (batch.length > 0) {
        console.log(`[${batchIndex}] (rowCount ${rowCount}): last dispatch ${batch.length} rows`)
        dispatch(batch).then(() => {
        })
      }
    })

    q.on('free', () => {
      resolve(null)
    })
  })
}
