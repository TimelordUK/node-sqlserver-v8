class JsonHelper {
  constructor (theConnection, tableName, procName, jsonProcName) {
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
  DROP TABLE ${tableName};`

    const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${procName}'))
 begin drop PROCEDURE ${procName} end `

    const dropJsonProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${jsonProcName}'))
    begin drop PROCEDURE ${jsonProcName} end `

    const createTableSql = `create TABLE ${tableName}(
\tjson varchar(max),
\tID int not null PRIMARY KEY ([ID])
)`

    const createJsonProcedureSql = `CREATE PROCEDURE ${jsonProcName}
    (
        @json nvarchar(max)
    )
    AS
BEGIN
SELECT 
  BusinessEntityID, 
  NationalIDNumber, 
  LoginID,
  OrganizationLevel,
  JobTitle,
  BirthDate,
  MaritalStatus,
  Gender,
  HireDate,
  SalariedFlag,
  VacationHours,
  SickHours,
  CurrentFlag
  FROM OPENJSON(@json)
  WITH (
    BusinessEntityID int 'strict $.BusinessEntityID',
    NationalIDNumber nvarchar(50) '$.NationalIDNumber',
    LoginID nvarchar(50) '$.LoginID',
    OrganizationLevel int '$.OrganizationLevel',
    JobTitle nvarchar(50) '$.JobTitle',
    BirthDate DateTime2 '$.BirthDate',
    MaritalStatus char '$.MaritalStatus',
    Gender char '$.Gender',
    HireDate DateTime2 '$.HireDate',
    SalariedFlag char '$.SalariedFlag',
    VacationHours int '$.VacationHours',
    SickHours int '$.SickHours',
    CurrentFlag char '$.CurrentFlag'
  )
END`

    const createProcedureSql = `CREATE PROCEDURE ${procName}
    (
        @ID int,
        @json nvarchar(max)
    )
    AS
        IF EXISTS (SELECT * FROM ${tableName}
                   WHERE id = @ID)
        BEGIN
            UPDATE ${tableName} 
            SET 
                json = @Json 
            WHERE 
                ID = @ID
        END
        ELSE
        BEGIN
           INSERT into ${tableName} (ID, JSON) VALUES (@ID, @Json)
        END`

    async function create () {
      async function exec (sql) {
        // console.log(`exec '${sql}' ....`)
        const promisedQuery = theConnection.promises.query
        await promisedQuery(sql)
        // console.log('... done')
      }

      await exec(dropProcedureSql)
      await exec(dropJsonProcedureSql)
      await exec(dropTableSql)
      await exec(createTableSql)
      await exec(createProcedureSql)
      await exec(createJsonProcedureSql)
    }

    this.create = create
  }
}

exports.JsonHelper = JsonHelper
