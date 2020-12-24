const sql = require('msnodesqlv8')

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, 'config.json'))
  return config.connection.local
}

const connectionString = getConnection()

sql.open(connectionString, function (err, con) {
  if (err) {
    if (Array.isArray(err)) {
      err.forEach((e) => {
        console.log(e.message)
      })
    } else {
      console.log(err.message)
    }
  } else {
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
      }
    })
    q.on('done', () => {
      console.log('done')
    })

    q.on('free', () => {
      console.log('free')
    })
  }
})
