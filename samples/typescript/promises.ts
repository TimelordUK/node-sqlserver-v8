import {Error, PoolOptions, Query, SqlClient, QueryDescription, Pool, PoolStatusRecord, Connection} from 'msnodesqlv8';

// require the module so it can be used in your node JS code.
export const sql : SqlClient = require('msnodesqlv8');

function getConnection () : string {
  const path = require('path')
  const config = require(path.join(__dirname, '..\\config.json'))
  return config.connection.local
}

async function openSelectClose() {
    try {
        const connStr: string = getConnection()
        console.log(`openSelectClose open ${connStr}`)
        const conn: Connection = await sql.promises.open(connStr)
        const res = await conn.promises.query('select @@SPID as spid')
        console.log(JSON.stringify(res, null, 4))
        await conn.promises.close()
    } catch (e: any) {
        console.log(e)
    }
}

async function ashoc() {
    try {
        const connStr: string = getConnection()
        console.log(`ashoc open ${connStr}`)
        const res = await sql.promises.query(connStr, 'select @@SPID as spid')
        console.log(`ashoc spid ${res.first[0].spid}`)
    } catch (e: any) {
        console.log(e)
    }
}

async function pool() {
    const connStr: string = getConnection()
    const size = 4
    const pool = new sql.Pool({
      connectionString: connStr,
      ceiling: size
    })
    await pool.promises.open()
    const all = Array(size * 2).fill(0).map((_, i) => pool.promises.query(`select ${i} as i, @@SPID as spid`))
    const promised = await Promise.all(all)
    const res = promised.map(r => r.first[0].spid)
    await pool.promises.close()
    console.log(`pool spids ${res.join(', ')}`)
}

async function run() {
    await openSelectClose()
    await ashoc()
    await pool()
}

run().then(() => {
    console.log('finished')
})
