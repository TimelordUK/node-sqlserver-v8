const sql = require('msnodesqlv8')
const util = require('util')

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, 'config.json'))
  return config.connection.local
}

const spName = 'test_sp'

const def = `create PROCEDURE ${spName} @param VARCHAR(50) 
AS 
BEGIN 
 RETURN LEN(@param); 
END 
`
main(1000).then(() => {
  console.log('done')
})

async function main (invocations) {
  await asConnection(invocations)
  await asPool(invocations)
}

async function asConnection (invocations) {
  try {
    const connectionString = getConnection()
    const promisedOpen = util.promisify(sql.open)
    const con = await promisedOpen(connectionString)
    const res = await test(con, invocations)
    console.log(`asConnection ${invocations} invocations, elapsed = ${res.elapsed}, res length=${res.results.length}`)
    const promisedClose = util.promisify(con.close)
    await promisedClose()
  } catch (err) {
    console.log(err.message)
  }
}

async function asPool (invocations) {
  try {
    const connectionString = getConnection()
    const size = 5
    const pool = new sql.Pool({
      connectionString: connectionString,
      ceiling: size
    })
    pool.on('error', e => {
      throw e
    })
    const promisedOpen = util.promisify(pool.open)
    const options = await promisedOpen()
    console.log(JSON.stringify(options, null, 4))
    const res = await test(pool, invocations)
    console.log(`asPool [${size}] ${invocations} invocations, elapsed = ${res.elapsed}, res length=${res.results.length}`)
    const promisedClose = util.promisify(pool.close)
    await promisedClose()
  } catch (err) {
    console.log(err.message)
  }
}

async function test (connectionProxy, invocations) {
  try {
    const helper = new ProcedureHelper(connectionProxy, spName, def)
    await helper.create()
    const promises = []
    const d = new Date()
    const p = {
      param: 'hello world'
    }
    for (let i = 0; i < invocations; ++i) {
      promises.push(helper.promisedCallProc(p))
    }
    const res = await Promise.all(promises)
    const elapsed = new Date() - d
    return {
      results: res,
      elapsed: elapsed
    }
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

class ProcedureHelper {
  constructor (connectionProxy, spName, def) {
    const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${spName}'))
    begin drop PROCEDURE ${spName} end `
    const promisedQuery = util.promisify(connectionProxy.query)

    async function create () {
      await promisedQuery(dropProcedureSql)
      await promisedQuery(def)
    }

    function promisedCallProc (o) {
      return new Promise((resolve, reject) => {
        const allResults = []
        connectionProxy.callproc(spName, o, (err, results, output, more) => {
          if (err) {
            reject(err)
          } else {
            allResults.push(results)
            if (!more) {
              const selects = allResults.reduce((agg, latest) => {
                if (latest.length > 0) {
                  agg.push(latest[0])
                }
                return agg
              }, [])
              resolve({
                results: selects,
                output: output
              })
            }
          }
        })
      })
    }
    this.promisedCallProc = promisedCallProc
    this.create = create
  }
}
