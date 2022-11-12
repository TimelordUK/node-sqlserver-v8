'use strict'

/* globals describe it */

const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('encrypt', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then((e) => {
      done()
    })
  })

  it('encrypted char via proc',
    async function handler () {
      if (!env.connectionString.includes('ColumnEncryption=Enabled')) return
      const procname = 'insert_emp_enc'
      const tableName = '[dbo].[Employees]'
      const procDef = {
        name: procname,
        sql: `create PROCEDURE insert_emp_enc
  @ssn char(11),
  @firstname nvarchar(50),
  @lastname nvarchar(50),
  @salary money
as
begin
    declare @ae_ssn char(11)  = @ssn
    declare @ae_firstname nvarchar(50) = @firstname
    declare @ae_lastname nvarchar(50)    = @lastname
    declare @ae_salary money =  @salary

    insert into Employees (ssn, firstname, lastname, salary)
    output inserted.*
    values (@ae_ssn, @ae_firstname, @ae_lastname, @ae_salary)
end
`
      }

      const tableDef = `CREATE TABLE ${tableName}(
      [EmployeeID] [int] IDENTITY(1,1) NOT NULL,
      [SSN] [char](11) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NULL,
      [FirstName] [nvarchar](50) NOT NULL,
      [LastName] [nvarchar](50) NOT NULL,
      [Salary] [money] NULL
    ) ON [PRIMARY]
    `

      const promises = env.theConnection.promises
      const procTest = env.procTest(procDef)
      const dropTableSql = env.dropTableSql(tableName)
      await promises.query(dropTableSql)
      await procTest.drop()
      await promises.query(tableDef)
      await procTest.create()
      await promises.query(`exec sp_refresh_parameter_encryption ${procname}`)
      const procParams = {
        ssn: '12345678901',
        firstname: 'boring',
        lastname: 'bob',
        salary: 3456.012
      }
      const expected = {
        EmployeeID: 1,
        FirstName: procParams.firstname,
        LastName: procParams.lastname,
        SSN: procParams.ssn,
        Salary: procParams.salary
      }
      const res = await promises.callProc(procname, procParams)
      expect(res.first[0]).to.deep.equals(expected)
      const res2 = await env.theConnection.promises.query('select * from  Employees ')
      expect(res2.first[0]).to.deep.equals(expected)
    })
})
