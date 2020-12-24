const sql = require('msnodesqlv8')
const util = require('util')

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, 'config.json'))
  return config.connection.local
}

main().then(() => {
  console.log('done')
})

async function main () {
  const connectionString = getConnection()
  const promisedOpen = util.promisify(sql.open)
  try {
    const con = await promisedOpen(connectionString)
    const promisedClose = util.promisify(con.close)
    await asFunction((con))
    console.log('')
    await asStream((con))
    await promisedClose()
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

function asStream (con) {
  return new Promise((resolve, reject) => {
    let errors = 0
    console.log('stream based multiple errors query')
    const q = con.query('select a;select b;')
    q.on('error', (err, more) => {
      if (err) {
        ++errors
        console.log(`on.error message = ${err.message} more = ${more}`)
        if (!more) {
          console.log('subscribe to multiple errors query')
          const req = con.query('select a;select b;')
          req.on('error', (msg, more) => {
            console.log('event error ', msg, ' more = ', more)
          })
        }
      }
    })

    q.on('done', () => {
      console.log('on.done')
      if (errors === 0) {
        reject(new Error('no errors raised'))
      }
    })

    q.on('free', () => {
      console.log('on.free')
      resolve(null)
    })
  })
}

function asFunction (con) {
  return new Promise((resolve, reject) => {
    console.log('callback based multiple errors query')
    const q = con.query('select a;select b;', function (err, res, more) {
      if (err) {
        console.log(err.message + 'more = ' + more)
        if (!more) {
          console.log('subscribe to multiple errors query')
          const req = con.query('select a;select b;')
          req.on('error', (msg, more) => {
            console.log('event error ', msg, ' more = ', more)
          })
        }
      } else {
        console.log(res)
        reject(new Error('no errors raised'))
      }
    })
    q.on('done', () => {
      console.log('done')
    })

    q.on('free', () => {
      console.log('free')
      resolve(null)
    })
  })
}
