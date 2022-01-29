'use strict'

const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

main().then(() => {
  console.log('done')
})

async function main () {
  const connectionString = new GetConnection().connectionString
  try {
    const con = await sql.promises.open(connectionString)
    await asFunction((con))
    await con.promises.close()
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

async function asFunction (theConnection) {
  console.log('work with tvp type to bulk insert')

  const tableName = 'TestTvp'
  const helper = new TvpHelper(theConnection, tableName)
  const vec = helper.getExtendedVec(10)
  const table = await helper.create()
  table.addRowsFromObjects(vec)
  const tp = sql.TvpFromTable(table)
  table.rows = []
  const execSql = 'exec insertTestTvp @tvp = ?;'
  console.log(`exec ${execSql}`)
  await theConnection.promises.query(execSql, [tp])
  const selectSql = `select * from ${tableName}`
  console.log(`select results ${selectSql}`)
  const res = await theConnection.promises.query(selectSql)
  const json = JSON.stringify(res, null, 4)
  console.log(`json = ${json}`)
}

class TvpHelper {
  constructor (theConnection, tableName) {
    let schemaName = 'dbo'
    let unqualifiedTableName = tableName
    const schemaIndex = tableName.indexOf('.')
    if (schemaIndex > 0) {
      schemaName = tableName.substr(0, schemaIndex)
      unqualifiedTableName = tableName.substr(schemaIndex + 1)
    }
    const createSchemaSql = `IF NOT EXISTS (
SELECT schema_name
FROM  information_schema.schemata
WHERE schema_name = '${schemaName}')
BEGIN
 EXEC sp_executesql N'CREATE SCHEMA ${schemaName}'
END`

    const tableTypeName = `${tableName}Type`
    const insertProcedureTypeName = `${schemaName}.Insert${unqualifiedTableName}`
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
  DROP TABLE ${tableName};`

    const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${insertProcedureTypeName}'))
 begin drop PROCEDURE ${insertProcedureTypeName} end `

    const createTableSql = `create TABLE ${tableName}(
\tdescription varchar(max),
\tusername nvarchar(30), 
\tage int, 
\tsalary real,
\tcode numeric(18,3),
\tstart_date datetime2
)`

    const dropTypeSql = `IF TYPE_ID(N'${tableTypeName}') IS not NULL drop type ${tableTypeName}`

    const createTypeSql = `CREATE TYPE ${tableTypeName} AS TABLE (description varchar(max), username nvarchar(30), age int, salary real, code numeric(18,3), start_date datetime2)`

    const insertProcedureSql = `create PROCEDURE ${insertProcedureTypeName}
@tvp ${tableTypeName} READONLY
AS
BEGIN
 set nocount on
 INSERT INTO ${tableName}
(
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
 )
 SELECT 
 [description],
 [username],
 [age],
 [salary],
 [code],
 [start_date]
n FROM @tvp tvp
END`

    const callProcFromProcName = 'callProcedureFromProcedure'
    const dropCallProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${callProcFromProcName}'))
    begin drop PROCEDURE ${callProcFromProcName} end`

    const callProcedureFromProcedureSql = `create PROCEDURE ${callProcFromProcName}
(
      @description varchar(max),
      @username nvarchar(30),
      @age int,
      @salary real,
      @code numeric(18,3),
      @start_date datetime2
)
AS
BEGIN
 set nocount on

 declare @TmpTvpTable TestTvpType;
 INSERT @TmpTvpTable
 (
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
 )
 values
(
   @description,
   @username,
   @age,
   @salary,
   @code,
   @start_date
 )
 
execute InsertTestTvp @TmpTvpTable;

SELECT 'Insert Complete';

WAITFOR DELAY '000:00:02';

execute InsertTestTvp @TmpTvpTable;

SELECT 'Insert 2 Complete';

 SELECT 
 [description],
 [username],
 [age],
 [salary],
 [code],
 [start_date]
FROM TestTvp;

END
`

    const localTableProcName = 'localTableProcedure'
    const dropLocalTableProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${localTableProcName}'))
    begin drop PROCEDURE ${localTableProcName} end`

    const localTableProcNameSql = `create PROCEDURE ${localTableProcName}
(
      @description varchar(max),
      @username nvarchar(30),
      @age int,
      @salary real,
      @code numeric(18,3),
      @start_date datetime2
)
AS
BEGIN
 set nocount on

 declare @TmpTvpTable AS TABLE (description varchar(max), username nvarchar(30), age int, salary real, code numeric(18,3), start_date datetime2);
 -- declare @TmpTvpTable TestTvpType;
 INSERT @TmpTvpTable
 (
   [description],
   [username],
   [age],
   [salary],
   [code],
   [start_date]
 )
 values
(
   @description,
   @username,
   @age,
   @salary,
   @code,
   @start_date
 )
 
SELECT 'Insert Complete';

 SELECT 
 [description],
 [username],
 [age],
 [salary],
 [code],
 [start_date]
FROM @TmpTvpTable;

SELECT 'Select Complete';

END
`
    async function create () {
      async function exec (sql) {
        console.log(`exec '${sql}' ....`)
        await theConnection.promises.query(sql)
        console.log('... done')
      }

      await exec(createSchemaSql)
      await exec(dropProcedureSql)
      await exec(dropCallProcedureSql)
      await exec(dropLocalTableProcedureSql)
      await exec(dropTableSql)
      await exec(createTableSql)
      await exec(dropTypeSql)
      await exec(createTypeSql)
      await exec(insertProcedureSql)
      await exec(callProcedureFromProcedureSql)
      await exec(dropLocalTableProcedureSql)
      await exec(localTableProcNameSql)

      return await theConnection.promises.getUserTypeTable(tableTypeName)
    }
    function repeat (a, num) {
      return new Array(num + 1).join(a)
    }

    function getVec (descriptionLength) {
      const longString = repeat('a', descriptionLength)
      const v = [
        {
          description: longString,
          username: 'santa',
          age: 1000,
          salary: 0,
          code: 123456789012.345,
          start_date: new Date(1695, 11, 25)
        },
        {
          description: 'an entry',
          username: 'md',
          age: 28,
          salary: 100000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ]
      v.forEach(e => {
        e.start_date.nanosecondsDelta = 0
      })
      return v
    }

    function getExtendedVec (descriptionLength) {
      const longString = repeat('-repeated-', descriptionLength)
      const v = [
        {
          description: longString,
          username: 'santa',
          age: 1000,
          salary: 0,
          code: 123456789012.345,
          start_date: new Date(1695, 11, 25)
        },
        {
          description: 'can compound Ã¢â‚¬',
          username: 'md',
          age: 28,
          salary: 100000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ]
      v.forEach(e => {
        e.start_date.nanosecondsDelta = 0
      })
      return v
    }

    this.create = create
    this.getVec = getVec
    this.getExtendedVec = getExtendedVec
  }
}
