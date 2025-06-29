const mssql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().getConnection('linux')
const saString = new GetConnection().getConnection('sa')

console.log(`connectionString = ${connectionString}`)

const table = '_customer2'

async function create () {
  const theConnection = await mssql.promises.open(connectionString)
  const mgr = theConnection.tableMgr()
  const res = await theConnection.promises.query('SELECT db_NAME() as [db]')
  const builder = mgr.makeBuilder(table, res.first[0].db || 'node')
  builder.addColumn('id').asInt().isIdentity(true, 1, 1).isPrimaryKey(1)
  builder.addColumn('name').asVarChar(256)
  builder.toTable()
  console.log(builder.createTableSql)
  await builder.drop()
  await builder.create()
  await theConnection.promises.close()
}

async function promised (i, connections, sql, mode, param) {
  if (!sql || sql.length === 0) return
  console.log(`iteration [${i}] mode = ${mode}: sql = ${sql}`)
  const promises = connections.map(conn => param
    ? conn.promises.query(sql, [param])
    : conn.promises.query(sql))
  mode = mode || 'all'
  switch (mode) {
    case 'all': {
      return await Promise.all(promises)
    }
    case 'settled': {
      return await Promise.allSettled(promises)
    }
  }
}

async function dbLocks (connection) {
  const sql = `SELECT resource_type, 
  resource_database_id, 
  request_mode, request_status FROM sys.dm_tran_locks
  WHERE resource_database_id = DB_ID()
  AND resource_associated_entity_id = OBJECT_ID(N'${table}')`
  const res = await connection.promises.query(sql)
  const modes = res.first ? res.first.map(x => x.request_mode) : []
  console.log(`modes = ${modes.join(', ')}`)
  return res.first ? res.first.length : 0
}

async function locks (saConnection) {
  const lockCount = await dbLocks(saConnection)
  console.log(`lock count ${lockCount}`)
}

async function showCounts (i, scenario, sql) {
  const connections = scenario.connections
  const res = await promised(i, connections, sql, 'settled')
  const counts = res.map(r => r.value.first[0].count)
  console.log(`iteration ${i} counts = ${counts.join(', ')}`)
}

async function once (i, scenario) {
  const saConnection = scenario.saConnection
  const connections = scenario.connections
  const noLockCount = `select count(*) as count from ${table} with (nolock)`
  try {
    await locks(saConnection)
    await promised(i, connections, scenario.beginSql, scenario.mode)
    await promised(i, connections, scenario.insertSql, scenario.mode, 'foo')
    await showCounts(i, scenario, noLockCount)
    await locks(saConnection)
    const to = setTimeout(() => locks(saConnection), 1000)
    if (scenario.commitAllButOne) {
      const [first, ...rest] = connections
      console.log(`commit ${rest.length}`)
      await promised(i, rest, scenario.commitSql, scenario.mode)
      await promised(i, [first], scenario.selectSql(i), scenario.mode)
      await promised(i, [first], scenario.commitSql, scenario.mode)
      await promised(i, connections, scenario.selectSql(i), scenario.mode)
    } else {
      await promised(i, connections, scenario.selectSql(i), scenario.mode)
      await promised(i, connections, scenario.commitSql, scenario.mode)
    }
    clearTimeout(to)
    await locks(saConnection)
    await showCounts(i, scenario, scenario.countSql)
  } catch (e) {
    console.log(e)
    promised(i, connections, scenario.rollbackSql, scenario.mode).catch(() => {
      console.log(e)
    }).finally(() => locks(saConnection))
  }
}

// with nolock clause will iterate but dangerous dirty reads
async function runner () {
  const scenario1 = {
    connections: 10,
    iterations: 10000,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?)`,
    selectSql: (i) => `select top 10 * from ${table} with (nolock) order by id DESC`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table} with (nolock)`
  }

  // 1 connection will iterate fine
  const scenario2 = {
    connections: 1,
    iterations: 10000,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?)`,
    selectSql: (i) => `select top 10 * from ${table}`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table}`
  }

  // this will deadlock
  const scenario3 = {
    mode: 'all',
    connections: 3,
    iterations: 5,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?)`,
    selectSql: (i) => `select * from ${table} where id = ${i}`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table}`
  }

  // will iterate but again with dirty read clause to avoid deadlock
  const scenario4 = {
    connections: 3,
    iterations: 50,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?);`,
    selectSql: (i) => `select top 10 * from ${table} with (READUNCOMMITTED);`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table}`
  }

  // same as 4 but here we set isolation level on transaction
  const scenario5 = {
    mode: 'all',
    connections: 3,
    iterations: 10,
    beginSql: 'SET TRANSACTION ISOLATION LEVEL read uncommitted; begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?);`,
    selectSql: () => `select top 10 * from ${table};`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table}`
  }

  const scenario7 = {
    mode: 'all',
    commitAllButOne: true,
    connections: 10,
    iterations: 500,
    beginSql: 'begin tran',
    insertSql: `INSERT INTO ${table} (name) OUTPUT INSERTED.id, INSERTED.name VALUES (?)`,
    selectSql: (i) => `select top 10 * from ${table} order by id DESC`,
    commitSql: 'commit tran',
    rollbackSql: 'rollback tran',
    countSql: `select count(*) as count from ${table}`
  }

  const scenario = scenario7

  const saConnection = await mssql.promises.open(saString)
  const opens = Array(scenario.connections).fill(0).map(() => mssql.promises.open(connectionString))
  const connections = await Promise.all(opens)
  const sp = await promised(0, connections, 'select @@SPID as spid', 'settled')
  const spids = sp.map(s => s.value.first[0].spid)

  console.log(`using pool ${scenario.connections} spids ${spids.join(', ')}`)

  scenario.saConnection = saConnection
  scenario.connections = connections
  scenario.spids = spids

  await create()

  for (let i = 0; i < scenario.iterations; ++i) {
    console.log(`[${i}] ...`)
    await once(i, scenario)
    console.log('')
  }
  const closes = connections.map(c => c.promises.close())
  closes.push(saConnection.promises.close())
  await Promise.allSettled(closes)
}

runner().then(() => {
  console.log('done')
})
