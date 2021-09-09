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

async function proc() {
    const spName = 'sp_test'
    const def = `create PROCEDURE ${spName} @param VARCHAR(50) 
    AS 
    BEGIN 
     RETURN LEN(@param); 
    END 
    `
    const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${spName}'))
    begin drop PROCEDURE ${spName} end `
    const connStr: string = getConnection()
    const conn: Connection = await sql.promises.open(connStr)
    await conn.promises.query(dropProcedureSql)
    await conn.promises.query(def)
    const msg = 'hello world'
    const res = await conn.promises.callProc(spName, {
        param: msg
      })
    await conn.promises.close()

    console.log(`proc returns ${res.returns} from param '${msg}''`)
}

async function run() {
    await openSelectClose()
    await proc()
    await ashoc()
    await pool()
}

run().then(() => {
    console.log('finished')
})
