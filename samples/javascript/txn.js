const mssql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().getConnection('linux')
console.log(`connectionString = ${connectionString}`)

async function run (id) {
  const conn = await mssql.promises.open(connectionString)
  iterate(id, conn)
}

let counter = 0
async function iterate (id, conn) {
  console.log(`start [${id}] counter = ${counter}`)
  try {
    await conn.promises.query('BEGIN TRANSACTION')
    await conn.promises.query('INSERT INTO _customer (name) OUTPUT INSERTED.id,INSERTED.name VALUES (?)', ['foo'])
    await conn.promises.query('COMMIT')
    await conn.promises.query('select top 10 * from _customer order by id DESC')
  } catch (e) {
    console.log(`[${id}] error = ${e}`)
  }
  console.log(`done [${id}] counter = ${counter}`)

  setTimeout(() => {
    ++counter
    iterate(id, conn)
  }, 100)
}

for (let i = 0; i < 10; i++) {
  run(i)
}
