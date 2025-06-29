
const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()

main().then(() => {
  console.log('done')
})

async function main () {
  try {
    await env.open()
    const con = env.theConnection
    await asFunction(con)
    console.log('')
    await asStream(con)
    await env.close()
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
        console.log(`on.error [${errors}] message = ${err.message} more = ${more}`)
        ++errors
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
      if (errors === 0) {
        reject(new Error('no errors raised'))
      }
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
