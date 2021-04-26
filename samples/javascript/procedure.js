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

const longspName = 'long_sp'
const longDef = `create PROCEDURE ${longspName} (
  @timeout datetime
  )AS
  BEGIN
    select top 100 * from sysobjects;
    waitfor delay @timeout;
    select top 100 * from syscolumns;
  END
  `
const helloSpName = 'hello_sp'
const helloSpDef = `create PROCEDURE ${helloSpName} AS
    BEGIN
      print 'hello';
      select top 2 id, name, type from sysobjects;
      print 'world';
      select top 2 id, name, xusertype from syscolumns;
      return 321;
    END
    `
async function main (invocations) {
  await asConnectionMessages(10000, 2)
  await asPoolMessages(10000, 2)
  await asConnectionTimeout(10000, 2)
  await asConnectionTimeout(200, 1)
  await asConnectionTimeout(200, 1)
  await asConnection(invocations)
  await asPool(invocations)
}

async function asConnectionMessages (procTimeout, invocations) {
  const connectionString = getConnection()
  const promisedOpen = util.promisify(sql.open)
  const con = await promisedOpen(connectionString)
  const res = await messages(con, invocations, procTimeout)
  for (let i = 0; i < res.length; ++i) {
    console.log(`asConnectionMessages [${i}]: ${helloSpName}: done - ${JSON.stringify(res[i], null, 4)}]`)
  }
}

async function asPoolMessages (procTimeout, invocations) {
  const pool = await getPool(5)
  const res = await messages(pool, invocations, procTimeout)
  for (let i = 0; i < res.length; ++i) {
    console.log(`asPoolMessages [${i}]: ${helloSpName}: done - ${JSON.stringify(res[i], null, 4)}]`)
  }
  await killPool(pool)
}

async function getPool (size) {
  const connectionString = getConnection()
  const pool = new sql.Pool({
    connectionString: connectionString,
    ceiling: size
  })
  pool.on('error', e => {
    throw e
  })
  const promisedOpen = util.promisify(pool.open)
  const options = await promisedOpen()
  console.log(`pool opened : ${JSON.stringify(options, null, 4)}`)
  return pool
}

async function killPool (pool) {
  const promisedClose = util.promisify(pool.close)
  await promisedClose()
  console.log('pool closed')
}

async function messages (connectionProxy, invocations, procTimeout) {
  const helper = new ProcedureHelper(connectionProxy, helloSpName, helloSpDef)
  await helper.create()
  const promises = []
  for (let i = 0; i < invocations; ++i) {
    promises.push(helper.callprocAggregator([], { timeoutMs: procTimeout, raw: i % 2 === 0 }))
  }
  try {
    const res = await Promise.all(promises)
    return res
  } catch (e) {
    console.log(e.message)
  }
}

async function asConnectionTimeout (procTimeout, invocations) {
  const connectionString = getConnection()
  const promisedOpen = util.promisify(sql.open)
  const con = await promisedOpen(connectionString)
  await testTimeout(con, invocations, procTimeout)
}

async function testTimeout (connectionProxy, invocations, procTimeout) {
  const helper = new ProcedureHelper(connectionProxy, longspName, longDef)
  await helper.create()

  const p = {
    timeout: '0:0:02'
  }
  for (let i = 0; i < invocations; ++i) {
    try {
      const res = await helper.callprocAggregator(p, { timeoutMs: procTimeout })
      console.log(`${longspName}: testTimeout [${i} - ${procTimeout}] done - sets returned ${res.results.length} [${res.results.map(r => r.length).join(', ')}]`)
    } catch (e) {
      console.log(`rejection: ${e.message} - test connection still good.`)
      // test can still use the connection
      const promisedQuery = util.promisify(connectionProxy.query)
      promisedQuery('SELECT @@version as version').then(res => {
        console.log(`good ${JSON.stringify(res, null, 4)}`)
      }).catch(e2 => {
        console.log(`bad ${e2.message}`)
      })
    }
  }
}

async function asConnection (invocations) {
  try {
    const connectionString = getConnection()
    const promisedOpen = util.promisify(sql.open)
    const con = await promisedOpen(connectionString)
    const res = await test(con, invocations)
    console.log(`${spName}: asConnection ${invocations} invocations, elapsed = ${res.elapsed}, res length=${res.results.length}`)
    const promisedClose = util.promisify(con.close)
    await promisedClose()
  } catch (err) {
    console.log(err.message)
  }
}

async function asPool (invocations) {
  try {
    const size = 5
    const pool = await getPool(size)
    const res = await test(pool, invocations)
    console.log(`${spName}: asPool [${size}] ${invocations} invocations, elapsed = ${res.elapsed}, res length=${res.results.length}`)
    await killPool(pool)
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
      promises.push(helper.callprocAggregator(p))
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

    this.procName = spName
    this.defition = def
    this.dropProcedureSql = dropProcedureSql
    this.connectionProxy = connectionProxy
  }

  async create () {
    const promisedQuery = util.promisify(this.connectionProxy.query)
    await promisedQuery(this.dropProcedureSql)
    await promisedQuery(this.defition)
  }

  callprocAggregator (o, options) {
    return this.connectionProxy.callprocAggregator(this.procName, o, options)
  }
}
