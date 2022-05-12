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
  const db = res.first[0].db || 'node'
  console.log(`db = ${db}`)
  const builder = mgr.makeBuilder(table, db)
  builder.addColumn('id').asInt().isIdentity(true, 1, 1).isPrimaryKey(1)
  builder.addColumn('name').asVarChar(256)
  builder.toTable()

  console.log(builder.createTableSql)
  console.log(builder.clusteredSql)
  console.log(builder.nonClusteredSql)

  await builder.drop()
  await builder.create()
  // await builder.index()

  await theConnection.promises.close()
}

async function dbLocks (id, connection) {
  const sql = `SELECT resource_type, 
  resource_database_id, 
  request_mode, request_status FROM sys.dm_tran_locks
  WHERE resource_database_id = DB_ID()
  AND resource_associated_entity_id = OBJECT_ID(N'${table}')`
  const res = await connection.promises.query(sql)
  const modes = res.first ? res.first.map(x => `${x.request_mode}.${x.resource_type}`) : []
  console.log(`[${id}] modes = ${modes.join(', ')}`)
  return res.first ? res.first?.length || 0 : 0
}

async function locks (id, saConnection) {
  const lockCount = await dbLocks(id, saConnection)
  console.log(`[${id}] lock count ${lockCount}`)
  return lockCount
}

// with read uncomitted clause will run but dangerous dirty reads
// const isolation = 'SNAPSHOT'
// default this induces  Bookmark lookup deadlock

const isolation = 'READ COMMITTED '

async function run (id, saConnection) {
  const conn = await mssql.promises.open(connectionString)
  await conn.promises.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`)
  iterate(id, conn, saConnection)
}

let counter = 0
async function iterate (id, conn, saConnection) {
  console.log(`start [${id}] counter = ${counter}`)
  try {
    console.log(`[${id}] step 1`)
    const modes = await locks(id, saConnection)
    console.log(`[${id}] step 2 mode count ${modes}`)
    const promises = conn.promises
    console.log(`[${id}] step 3`)
    await promises.query('BEGIN TRANSACTION')
    console.log(`[${id}] step 4`)
    await promises.query(`INSERT INTO ${table} (name) VALUES (?)`, ['foo'])
    console.log(`[${id}] step 5`)
    await locks(id, saConnection)
    console.log(`[${id}] step 6`)
    await promises.query(`select top 10 id, name from ${table} order by id DESC`)
    console.log(`[${id}] step 7`)
    await promises.query('COMMIT')
    console.log(`[${id}] step 8`)
    // get a row count
    const total = await promises.query(`select count(*) as rc from ${table}`)
    console.log(`[${id}] row count = ${total.first[0].rc}`)
    await locks(id, saConnection)
  } catch (e) {
    console.log(`[${id}] error = ${e}`)
  }
  console.log(`done [${id}] counter = ${counter}`)

  setTimeout(() => {
    ++counter
    iterate(id, conn, saConnection)
  }, 100)
}

async function runner () {
  await create()
  const saConnection = await mssql.promises.open(saString)
  for (let i = 0; i < 3; i++) {
    run(i, saConnection)
  }
}

runner().then(() => {
  console.log('done')
})
