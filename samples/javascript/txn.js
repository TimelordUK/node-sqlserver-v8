const mssql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().getConnection('linux')
console.log(`connectionString = ${connectionString}`)

async function promised (i, connections, sql, param) {
  console.log(`iteration ${i} sql = ${sql}`)
  const promises = connections.map(conn => param
    ? conn.promises.query(sql, [param])
    : conn.promises.query(sql))
  return await Promise.all(promises)
}

async function once (i, connections, scenario) {
  await promised(i, connections, scenario.beginSql)
  await promised(i, connections, scenario.insertSql, 'foo')
  await promised(i, connections, scenario.selectSql)
  await promised(i, connections, scenario.commitSql)
  const res = await promised(i, connections, scenario.countSql)
  const counts = res.map(r => r.first[0].count)
  console.log(`iteration ${i} counts = ${counts.join(', ')}`)
}

async function runner () {
  const table = '_customer'

  const scenario1 = {
    connections: 10,
    iterations: 10000,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id,INSERTED.name VALUES (?)`,
    selectSql: `select top 10 * from ${table} with (nolock) order by id DESC`,
    commitSql: 'commit tran',
    countSql: `select count(*) as count from ${table} with (nolock)`
  }

  const scenario2 = {
    connections: 1,
    iterations: 10000,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id,INSERTED.name VALUES (?)`,
    selectSql: `select top 10 * from ${table}`,
    commitSql: 'commit tran',
    countSql: `select count(*) as count from ${table}`
  }

  const scenario = scenario1

  const promises = Array(scenario.connections).fill(0).map(() => mssql.promises.open(connectionString))
  const connections = await Promise.all(promises)
  const sp = await promised(0, connections, 'select @@SPID as spid')
  const spids = sp.map(s => s.first[0].spid)
  console.log(`using pool ${scenario.connections} spids ${spids.join(', ')}`)
  for (let i = 0; i < scenario.iterations; ++i) {
    console.log(`[${i}] ...`)
    await once(i, connections, scenario)
    console.log('')
  }
}

runner().then(() => {
  console.log('done')
})
