import {
    PoolOptions,  
    SqlClient,  
    Pool,  
    Connection, 
    QueryAggregatorResults, 
    ConnectionPromises, 
    BulkTableMgr
} from 'msnodesqlv8';

// require the module so it can be used in your node JS code.
export const sql : SqlClient = require('msnodesqlv8');

async function run() {
    await openSelectClose()
    await proc()
    await adhocProc()
    await adhocQuery()
    await pool()
    await table()
    await prepared()
}

run().then(() => {
    console.log('finished')
})

function getConnection () : string {
  const path = require('path')
  const config = require(path.join(__dirname, '../config.json'))
  return config.connection.local
}

async function openSelectClose() {
    try {
        const connStr: string = getConnection()
        const conn: Connection = await sql.promises.open(connStr)
        const res: QueryAggregatorResults = await conn.promises.query('select @@SPID as spid')
        console.log(JSON.stringify(res, null, 4))
        await conn.promises.close()
    } catch (e) {
        console.log(e)
    }
}

async function adhocQuery() {
    try {
        const connStr: string = getConnection()
        const res: QueryAggregatorResults = await sql.promises.query(connStr, 'select @@SPID as spid')
        console.log(`ashoc spid ${res.first[0].spid}`)
    } catch (e) {
        console.log(e)
    }
}

async function pool() {
    try {
        const connStr: string = getConnection()
        const size = 4
        const options: PoolOptions = {
            connectionString: connStr,
            ceiling: size
        }
        const pool: Pool = new sql.Pool(options)
        await pool.promises.open()
        const all = Array(size * 2).fill(0).map((_, i) => pool.promises.query(`select ${i} as i, @@SPID as spid`))
        const promised: QueryAggregatorResults[] = await Promise.all(all)
        const res = promised.map(r => r.first[0].spid)
        await pool.promises.close()
        console.log(`pool spids ${res.join(', ')}`)
    } catch (e) {
        console.log(e)
    }
}

class ProcTest {
    dropProcedureSql: string
    
    constructor (public connStr: string, public def: ProcDef) {
        this.dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${def.name}'))
        begin drop PROCEDURE ${def.name} end `
    }

    async create () {
        try {
            const conn: Connection = await sql.promises.open(this.connStr)
            const promises: ConnectionPromises = conn.promises
            await promises.query(this.dropProcedureSql)
            await promises.query(this.def.sql)
            await conn.promises.close()
        } catch (e) {
            console.log(e)
        }
    }

    async drop () {
        try {
            const conn: Connection = await sql.promises.open(this.connStr)
            const promises: ConnectionPromises = conn.promises
            await promises.query(this.dropProcedureSql)
            await conn.promises.close()
        } catch (e) {
            console.log(e)
        }
    }
}

interface ProcDef {
    name: string,
    sql: string
}

const sampleProc: ProcDef = {
    name: 'sp_test',
    sql: `create PROCEDURE sp_test @param VARCHAR(50) 
    AS 
    BEGIN 
    RETURN LEN(@param); 
    END 
    `
}

async function adhocProc() {
    try {
        const connStr: string = getConnection()
        const proc = new ProcTest(connStr, sampleProc)
        await proc.create()    
        const msg = 'hello world'
        const res: QueryAggregatorResults = await sql.promises.callProc(connStr, sampleProc.name, {
            param: msg
        })        
        await proc.drop()
        console.log(`adhocProc returns ${res.returns} from param '${msg}''`)
    } catch (e) {
        console.log(e)
    }
}

async function proc() {
    try {
        const connStr: string = getConnection()
        const proc = new ProcTest(connStr, sampleProc)
        await proc.create()    
        const conn: Connection = await sql.promises.open(connStr)
        const promises: ConnectionPromises = conn.promises
        const msg = 'hello world'
        const res: QueryAggregatorResults = await promises.callProc(sampleProc.name, {
            param: msg
        })
       
        console.log(`proc returns ${res.returns} from param '${msg}''`)
        await proc.drop()
        await promises.close()
    } catch (e) {
        console.log(e)
    }
}

function getInsertVec (rows: number): SampleRecord[] {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = []
      for (let i = 0; i < rows; ++i) {
        expected.push(new SampleRecord(
          i,
          testDate,
          `${i}`,
          `testing${i + 1}2Data`,
          `testing${i + 2}2Data`,
          `testing${i + 3}2Data`
        ))
      }
      return expected
}

class SampleRecord {
    constructor(public id: number, public d1: Date, public s1: string, public s2: string, public s3: string, public s4: string) {
    }
    asArray(): any[] {
        return[
            this.id,
            this.d1,
            this.s1,
            this.s2,
            this.s3,
            this.s4
        ]
    }
}

const sampleTableDef: TableDef = {
    tableName: 'test_table_bulk',
    columns: [
      {
        name: 'id',
        type: 'INT PRIMARY KEY'
      },
      {
        name: 'd1',
        type: 'datetime'
      },
      {
        name: 's1',
        type: 'VARCHAR (255) NOT NULL'
      },
      {
        name: 's2',
        type: 'VARCHAR (100) NOT NULL'
      },
      {
        name: 's3',
        type: 'VARCHAR (50) NOT NULL'
      },
      {
        name: 's4',
        type: 'VARCHAR (50) NOT NULL'
      }
    ]
  }

async function table() {
      try {
        const connStr: string = getConnection()
        const connection = await sql.promises.open(connStr)
        const tm: BulkTableTest = new BulkTableTest(connection, sampleTableDef)
        const table: BulkTableMgr = await tm.create()
        const vec: SampleRecord[] = getInsertVec(10)
        console.log(`table = ${tm.createTableSql}`)
        await table.promises.insert(vec)
        const read = await connection.promises.query(tm.selectSql)
        console.log(`table ${read.first.length} rows from ${tm.tableName}`)
        console.log(JSON.stringify(read.first, null, 4))
        await tm.drop()
        await connection.promises.close()
       } catch (e) {
        console.log(e)
      }
}

async function prepared() {
    try {
      const connStr: string = getConnection()
      const connection = await sql.promises.open(connStr)
      const tm: BulkTableTest = new BulkTableTest(connection, sampleTableDef)
      const vec: SampleRecord[] = getInsertVec(2)
      await tm.create()
      console.log(`prepared = ${tm.createTableSql}`)
      const p1 = await connection.promises.prepare(tm.insertParamsSql)
      await p1.preparedQuery(vec[0].asArray())
      await p1.preparedQuery(vec[1].asArray())
      const read = await connection.promises.query(tm.selectSql)
      console.log(`prepared ${read.first.length} rows from ${tm.tableName}`)
      console.log(JSON.stringify(read.first, null, 4))
      await p1.promises.free()
      await tm.drop()
      await connection.promises.close()
     } catch (e) {
      console.log(e)
    }
}


interface TableColumn {
    name: string
    type: string
}

interface TableDef {
    tableName: string
    columns: TableColumn[]
}

class BulkTableTest {
    dropTableSql: string
    createTableSql: string
    clusteredSql: string
    selectSql: string 
    insertSql: string
    truncateSql: string
    tableName: string
    paramsSql: string
    insertParamsSql:string
    
    constructor (public theConnection: Connection, public definition: TableDef) {
      const tableName = definition.tableName
      const columns = definition.columns.map(e => `${e.name} ${e.type}`).join(', ')
      const insertColumnNames = definition.columns.filter((c: TableColumn) => {
        const res = !c.type.includes('identity')
        return res
      }).map(e => `${e.name}`).join(', ')

      const columnNames = definition.columns.map(e => `${e.name}`).join(', ')
      this.dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
      this.createTableSql = `CREATE TABLE ${tableName} (${columns})`
      this.clusteredSql = `CREATE CLUSTERED INDEX IX_${tableName} ON ${tableName}(id)`
      this.insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
      this.selectSql = `SELECT ${columnNames} FROM ${tableName}`
      this.truncateSql = `TRUNCATE TABLE ${tableName}`
      this.paramsSql = `(${definition.columns.map(_ => '?').join(', ')})`
      this.insertParamsSql = `${this.insertSql} ${this.paramsSql}`
      this.tableName = tableName
    }

    async drop () {
        await this.theConnection.promises.query(this.dropTableSql)
    }

    async create () {
      const promises = this.theConnection.promises
      await promises.query(this.dropTableSql)
      await promises.query(this.createTableSql)
      const table = await promises.getTable(this.tableName)
      return table
    }
  }