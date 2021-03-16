'use strict'
/* global suite teardown teardown setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')
const util = require('util')
const { test } = require('mocha')

suite('json', function () {
  let theConnection
  this.timeout(60000)
  let connStr
  let helper

  const sql = global.native_sql

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
          const promisedQuery = util.promisify(theConnection.query)
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

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert.ifError(err)
      done()
    })
  })

  function insertRec (p, id, element) {
    return new Promise((resolve, reject) => {
      const txt = JSON.stringify(element, null, 4)
      p.call({
        ID: id++,
        json: txt
      }, (err, res) => {
        if (err) {
          reject(err)
        } else {
          resolve(txt)
        }
      })
    })
  }

  test('use proc to insert a JSON array and bulk parse on server', testDone => {
    async function work () {
      try {
        const tableName = 'employeeJson'
        const procName = 'AddUpdateEmployeeJsonRecord'
        const procNameJson = 'ParseJsonArray'
        const h = new JsonHelper(theConnection, tableName, procName, procNameJson)
        await h.create()
        const parsedJSON = helper.getJSON()
        const pm = theConnection.procedureMgr()
        const promisedGetProc = util.promisify(pm.getProc)
        const p = await promisedGetProc(procNameJson)
        const json = JSON.stringify(parsedJSON, null, 4)
        const promisedCall = util.promisify(p.call)
        const res = await promisedCall({
          json: json
        })
        assert(res)
        assert(Array.isArray(res))
      } catch (e) {
        assert.ifError(e)
      }
    }
    work().then(() => {
      testDone()
    }).catch(e => {
      assert.ifError(e)
    })
  })

  test('use proc to insert a JSON based complex object', testDone => {
    async function work () {
      try {
        const tableName = 'employeeJson'
        const procName = 'AddUpdateEmployeeJsonRecord'
        const h = new JsonHelper(theConnection, tableName, procName)
        await h.create()
        const parsedJSON = helper.getJSON()
        const pm = theConnection.procedureMgr()
        const promisedGetProc = util.promisify(pm.getProc)
        const p = await promisedGetProc(procName)
        let id = 0
        const promises = parsedJSON.map(r => insertRec(p, id++, r))
        const expected = await Promise.all(promises)
        const promisedQuery = util.promisify(theConnection.query)
        const selectedRecords = await promisedQuery(`select * from ${tableName} order by id asc`)
        const selected = selectedRecords.map(rec => rec.json)
        assert.deepStrictEqual(expected, selected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    work().then(() => {
      testDone()
    }).catch(e => {
      assert.ifError(e)
    })
  })
})
