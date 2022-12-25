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
    env.close().then(() => {
      done()
    })
  })

  const encryptHelper = env.encryptHelper

  class FieldBuilder {
    tableName = null
    procName = null
    constructor () {
      this.tableName = 'test_encrpted_table'
      this.procName = `proc_insert_${this.tableName}`
    }

    makeProcParams (i) {
      i = i || 0
      return {
        field: this.makeValue(i)
      }
    }

    checkEqual (lhs, rhs) {
      expect(lhs).to.deep.equals(rhs)
    }

    build (builder) {}
    makeValue (i) {}
  }

  class EncryptionFieldTester {
    builder = null
    fieldBuilder = null

    constructor (fieldBuilder) {
      this.fieldBuilder = fieldBuilder
    }

    async makeBuilder () {
      const mgr = env.theConnection.tableMgr()
      const dbName = await env.getDbName()
      const builder = mgr.makeBuilder(this.fieldBuilder.tableName, dbName)
      builder.addColumn('id').asInt().isIdentity(1, 1).notNull()
      this.fieldBuilder.build(builder)

      return builder
    }

    noID (res) {
      const { id, ...rest } = res
      return rest
    }

    async prepare () {
      const procname = this.fieldBuilder.procName
      this.builder = await this.makeBuilder()
      this.table = this.builder.toTable()
      const builder = this.builder
      await builder.drop()
      await builder.create()
      const procSql = builder.insertProcSql(procname)

      const promises = env.theConnection.promises
      const procDef2 = {
        name: procname,
        sql: procSql
      }
      const procTest = env.procTest(procDef2)
      await procTest.drop()
      await procTest.create()
      await promises.query(`exec sp_refresh_parameter_encryption ${procDef2.name}`)
    }

    make (rows) {
      rows = rows || 50
      return Array(rows).fill(0).map((_, i) => {
        const builder = this.fieldBuilder
        return builder.makeProcParams(i)
      })
    }

    async testTable (rows) {
      rows = rows || 1
      const expected = this.make(rows)
      const promises = this.table.promises
      const tableName = this.fieldBuilder.tableName
      await promises.insert(expected)
      await this.selectCheck(tableName, expected)
    }

    async selectCheck (tableName, expected) {
      const conPromises = env.theConnection.promises
      const actual = await conPromises.query(`select * from ${tableName} `)
      expect(actual.first.length).to.equals(expected.length)
      for (let i = 0; i < expected.length; ++i) {
        this.fieldBuilder.checkEqual(this.noID(actual.first[i]), expected[i])
      }
    }

    async testProc () {
      const procParams = this.fieldBuilder.makeProcParams()
      const procname = this.fieldBuilder.procName
      const promises = env.theConnection.promises
      const res = await promises.callProc(procname, procParams)
      this.fieldBuilder.checkEqual(this.noID(res.first[0]), procParams)
      const res2 = await promises.query(`select * from ${this.fieldBuilder.tableName} `)
      this.fieldBuilder.checkEqual(this.noID(res2.first[0]), procParams)
    }
  }

  /**
   * CREATE TABLE [dbo].[test_encrpted_table](
   *  [id] [int] IDENTITY(1,1) NOT NULL,
   *  [BusinessEntityID] [int] NULL,
   *  [NationalIDNumber] [nvarchar](15) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [LoginID] [nvarchar](256) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [OrganizationNode] [hierarchyid] NULL,
   *  [OrganizationLevel]  AS ([OrganizationNode].[GetLevel]()),
   *  [JobTitle] [nvarchar](50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [BirthDate] [date] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [MaritalStatus] [char](1) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [Gender] [char](1) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [HireDate] [date] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [SalariedFlag] [bit] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [VacationHours] [smallint] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [SickLeaveHours] [smallint] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [CurrentFlag] [bit] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
   *  [rowguid] [uniqueidentifier] ROWGUIDCOL  NOT NULL,
   *  [ModifiedDate] [datetime2](7) ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL
   * ) ON [PRIMARY]
   * */

  /**
   * create procedure [dbo].[proc_insert_test_encrpted_table]
   *   (
   *     @BusinessEntityID int ,
   *    @NationalIDNumber nvarchar (15) ,
   *    @LoginID nvarchar (256) ,
   *    @OrganizationNode hierarchyid ,
   *    @JobTitle nvarchar (50) ,
   *    @BirthDate date ,
   *    @MaritalStatus char (1) ,
   *    @Gender char (1) ,
   *    @HireDate date ,
   *    @SalariedFlag bit ,
   *    @VacationHours smallint ,
   *    @SickLeaveHours smallint ,
   *    @CurrentFlag bit ,
   *    @rowguid uniqueidentifier ,
   *    @ModifiedDate datetime2
   *   )
   *   as
   *   begin
   *     declare @ae_BusinessEntityID int  = @BusinessEntityID
   *    declare @ae_NationalIDNumber nvarchar (15)  = @NationalIDNumber
   *    declare @ae_LoginID nvarchar (256)  = @LoginID
   *    declare @ae_OrganizationNode hierarchyid  = @OrganizationNode
   *    declare @ae_JobTitle nvarchar (50)  = @JobTitle
   *    declare @ae_BirthDate date  = @BirthDate
   *    declare @ae_MaritalStatus char (1)  = @MaritalStatus
   *    declare @ae_Gender char (1)  = @Gender
   *    declare @ae_HireDate date  = @HireDate
   *    declare @ae_SalariedFlag bit  = @SalariedFlag
   *    declare @ae_VacationHours smallint  = @VacationHours
   *    declare @ae_SickLeaveHours smallint  = @SickLeaveHours
   *    declare @ae_CurrentFlag bit  = @CurrentFlag
   *    declare @ae_rowguid uniqueidentifier  = @rowguid
   *    declare @ae_ModifiedDate datetime2  = @ModifiedDate
   *     insert into node.dbo.test_encrpted_table (BusinessEntityID, NationalIDNumber, LoginID, OrganizationNode, JobTitle, BirthDate, MaritalStatus, Gender, HireDate, SalariedFlag, VacationHours, SickLeaveHours, CurrentFlag, rowguid, ModifiedDate)
   *     output inserted.*
   *     values (@ae_BusinessEntityID, @ae_NationalIDNumber, @ae_LoginID, @ae_OrganizationNode, @ae_JobTitle, @ae_BirthDate, @ae_MaritalStatus, @ae_Gender, @ae_HireDate, @ae_SalariedFlag, @ae_VacationHours, @ae_SickLeaveHours, @ae_CurrentFlag, @ae_rowguid, @ae_ModifiedDate)
   *   end
   *
   */

  class FieldBuilderEmployee extends FieldBuilder {
    constructor () {
      super()
      const employee = env.employee
      this.records = employee.make(250)
    }

    noOrgLevel (v) {
      const { OrganizationLevel, ...rest } = v
      return rest
    }

    makeProcParams (i) {
      i = i || 0
      const v = this.makeValue(i)
      return this.noOrgLevel(v)
    }

    checkEqual (lhs, rhs) {
      expect(this.noOrgLevel(lhs)).to.deep.equals(this.noOrgLevel(rhs))
    }

    build (builder) {
      builder.addColumn('[BusinessEntityID]').asInt().isPrimaryKey(1)
      builder.addColumn('[NationalIDNumber]').asNVarChar(15).withDecorator(encryptHelper.txtWithEncrypt).notNull()
      builder.addColumn('[LoginID]').asNVarChar(256).withDecorator(encryptHelper.txtWithEncrypt).notNull()
      builder.addColumn('[OrganizationNode]').asHierarchyId().null()
      builder.addColumn('[OrganizationLevel]').asInt().asExpression('AS ([OrganizationNode].[GetLevel]())')
      builder.addColumn('[JobTitle]').asNVarChar(50).withDecorator(encryptHelper.txtWithEncrypt).notNull()
      builder.addColumn('[BirthDate]').asDate().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[MaritalStatus]').asChar(1).withDecorator(encryptHelper.txtWithEncrypt).notNull()
      builder.addColumn('[Gender]').asChar(1).withDecorator(encryptHelper.txtWithEncrypt).notNull()
      builder.addColumn('[HireDate]').asDate().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[SalariedFlag]').asBit().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[VacationHours]').asSmallInt().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[SickLeaveHours]').asSmallInt().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[CurrentFlag]').asBit().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
      builder.addColumn('[rowguid]').asUniqueIdentifier().withDecorator('ROWGUIDCOL  NOT NULL')
      builder.addColumn('[ModifiedDate]').asDateTime2().withDecorator(encryptHelper.fieldWithEncrpyt).notNull()
    }

    makeValue (i) {
      return this.records[i % this.records.length]
    }
  }
  class FieldBuilderFloat extends FieldBuilder {
    constructor (val) {
      super()
      this.value = val || 12.1234
    }

    checkEqual (lhs, rhs) {
      expect(lhs.field).closeTo(rhs.field, 1e-5)
    }

    build (builder) {
      builder.addColumn('field').asFloat().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? this.value
        : -this.value
    }
  }
  class FieldBuilderReal extends FieldBuilder {
    constructor (val) {
      super()
      this.value = val || -12.1234
    }

    checkEqual (lhs, rhs) {
      expect(lhs.field).closeTo(rhs.field, 1e-5)
    }

    build (builder) {
      builder.addColumn('field').asReal().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0 ? this.value : -this.value
    }
  }
  class FieldBuilderNumeric extends FieldBuilder {
    constructor (val) {
      super()
      this.value = val || 12.12345678901234
    }

    checkEqual (lhs, rhs) {
      expect(lhs.field).closeTo(rhs.field, 1e-7)
    }

    build (builder) {
      builder.addColumn('field').asNumeric(20, 15).withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? this.value
        : -this.value
    }
  }
  class FieldBuilderDecimal extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asDecimal(20, 18).withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const divisor = ((i % 10) + 1) * 2
      return 12.123456789 / divisor
    }
  }
  class FieldBuilderBit extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBit().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0
    }
  }
  class FieldBuilderBigInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBigInt().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const addition = (i % 10) * 4 + i
      const v = 1234567890123 + addition
      const sign = i % 2 === 0 ? 1 : -1
      return v * sign
    }
  }
  class FieldBuilderTinyInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asTinyInt().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const addition = (i % 10)
      const v = (200 + addition) % 255
      return v
    }
  }
  class FieldBuilderInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asInt().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const addition = (i % 10)
      const v = 12345 + addition
      const sign = i % 2 === 0 ? 1 : -1
      return v * sign
    }
  }
  class FieldBuilderSmallInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asSmallInt().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const addition = (i % 10)
      const v = 123 + addition
      const sign = i % 2 === 0 ? 1 : -1
      return v * sign
    }
  }
  class FieldBuilderChar extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asChar(10).withDecorator(encryptHelper.txtWithEncrypt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? '0123456789'
        : '9876543220'
    }
  }
  class FieldBuilderNVarChar extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asNVarChar(50).withDecorator(encryptHelper.txtWithEncrypt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? 'hello world!'
        : 'goodbye cruel world!'
    }
  }
  class FieldBuilderVarBinary extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asVarBinary(50).withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue () {
      return Buffer.from('5AE178', 'hex')
    }
  }
  class FieldBuilderBinary extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBinary(3).withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue () {
      return Buffer.from('5AE178', 'hex')
    }
  }
  class FieldBuilderDate extends FieldBuilder {
    value = null
    constructor (val) {
      super()
      this.value = val || env.timeHelper.getUTCDate(new Date())
    }

    build (builder) {
      builder.addColumn('field').asDate().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const offset = i % 10
      const result = new Date(this.value)
      result.setDate(result.getDate() - offset)
      return this.value
    }
  }
  class FieldBuilderDateTimeOffset extends FieldBuilder {
    value = null
    constructor (val) {
      super()
      this.value = val || env.timeHelper.getUTCDateHHMMSS(new Date())
    }

    build (builder) {
      builder.addColumn('field').asDateTimeOffset().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const offset = i % 10
      const result = new Date(this.value)
      result.setDate(result.getDate() - offset)
      return this.value
    }
  }
  class FieldBuilderDateTime2 extends FieldBuilder {
    value = null
    constructor (val) {
      super()
      this.value = val || env.timeHelper.getUTCDateHHMMSS(new Date())
    }

    build (builder) {
      builder.addColumn('field').asDateTime2().withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      const offset = i % 10
      const result = new Date(this.value)
      result.setDate(result.getDate() - offset)
      return this.value
    }
  }
  class FieldBuilderTime extends FieldBuilder {
    value = null
    constructor (scale) {
      super()
      this.scale = scale
      this.value = scale >= 3
        ? env.timeHelper.getUTCTime1970HHMMSSMS(new Date())
        : env.timeHelper.getUTCTime1970HHMMSS(new Date())
    }

    build (builder) {
      builder.addColumn('field').asTime(this.scale).withDecorator(encryptHelper.fieldWithEncrpyt)
    }

    makeValue (i) {
      return this.value
    }
  }

  async function runProc (fieldBuilder) {
    if (!env.isEncryptedConnection()) return

    const tester = new EncryptionFieldTester(fieldBuilder)
    await tester.prepare()
    await tester.testProc()
  }

  async function runTable (fieldBuilder) {
    if (!env.isEncryptedConnection()) return

    const tester = new EncryptionFieldTester(fieldBuilder)
    await tester.prepare()
    await tester.testTable()
  }
  it('encrypted UTC datetimeoffset via proc', async function handler () {
    await runProc(new FieldBuilderDateTimeOffset())
  })

  it('encrypted UTC datetimeoffset via table', async function handler () {
    await runTable(new FieldBuilderDateTimeOffset())
  })

  it('encrypted employee via table', async function handler () {
    await runTable(new FieldBuilderEmployee())
  })

  it('encrypted employee via proc', async function handler () {
    await runProc(new FieldBuilderEmployee())
  })

  it('encrypted float via proc', async function handler () {
    await runProc(new FieldBuilderFloat())
  })

  /*
  it('encrypted float via table', async function handler () {
    await runTable(new FieldBuilderFloat())
  }) */

  it('encrypted time(0) via proc', async function handler () {
    await runProc(new FieldBuilderTime(0))
  })

  it('encrypted time(3) via proc', async function handler () {
    await runProc(new FieldBuilderTime(3))
  })

  it('encrypted time(4) via proc', async function handler () {
    await runProc(new FieldBuilderTime(4))
  })

  it('encrypted time(7) via proc', async function handler () {
    await runProc(new FieldBuilderTime(7))
  })

  it('encrypted time(0) array via table', async function handler () {
    await runTable(new FieldBuilderTime(0))
  })

  it('encrypted time(7) array via table', async function handler () {
    await runTable(new FieldBuilderTime(7))
  })

  it('encrypted date via proc', async function handler () {
    await runProc(new FieldBuilderDate())
  })

  it('encrypted date via table', async function handler () {
    await runTable(new FieldBuilderDate())
  })

  it('encrypted real via proc', async function handler () {
    await runProc(new FieldBuilderReal())
  })

  it('encrypted real via table', async function handler () {
    await runTable(new FieldBuilderReal())
  })

  it('encrypted UTC datetime2 via proc', async function handler () {
    await runProc(new FieldBuilderDateTime2())
  })

  it('encrypted UTC datetime2 via table', async function handler () {
    await runTable(new FieldBuilderDateTime2())
  })

  it('encrypted numeric -12.12345 via proc',
    async function handler () {
      await runProc(new FieldBuilderNumeric(-12.12345))
    })

  it('encrypted numeric 12.12345 via proc',
    async function handler () {
      await runProc(new FieldBuilderNumeric(12.12345))
    })

  it('encrypted numeric 12.12345678901234 via proc',
    async function handler () {
      await runProc(new FieldBuilderNumeric())
    })

  it('encrypted numeric via table',
    async function handler () {
      await runTable(new FieldBuilderNumeric())
    })

  it('encrypted binary via proc',
    async function handler () {
      await runProc(new FieldBuilderBinary())
    })

  it('encrypted binary via table',
    async function handler () {
      await runTable(new FieldBuilderBinary())
    })

  it('encrypted varbinary via proc',
    async function handler () {
      await runProc(new FieldBuilderVarBinary())
    })

  it('encrypted varbinary via table',
    async function handler () {
      await runTable(new FieldBuilderVarBinary())
    })

  it('encrypted decimal via proc',
    async function handler () {
      await runProc(new FieldBuilderDecimal())
    })

  it('encrypted decimal via table',
    async function handler () {
      await runTable(new FieldBuilderDecimal())
    })

  it('encrypted nvarchar via proc',
    async function handler () {
      await runProc(new FieldBuilderNVarChar())
    })

  it('encrypted nvarchar via table',
    async function handler () {
      await runTable(new FieldBuilderNVarChar())
    })

  it('encrypted char 10 via proc',
    async function handler () {
      await runProc(new FieldBuilderChar())
    })

  it('encrypted char 10 via table',
    async function handler () {
      await runTable(new FieldBuilderChar())
    })

  it('encrypted bit via proc',
    async function handler () {
      await runProc(new FieldBuilderBit())
    })

  it('encrypted bit via table',
    async function handler () {
      await runTable(new FieldBuilderBit())
    })

  it('encrypted big int via proc',
    async function handler () {
      await runProc(new FieldBuilderBigInt())
    })

  it('encrypted big int via table',
    async function handler () {
      await runTable(new FieldBuilderBigInt())
    })

  it('encrypted tiny int via proc',
    async function handler () {
      await runProc(new FieldBuilderTinyInt())
    })

  it('encrypted tiny int via table',
    async function handler () {
      await runTable(new FieldBuilderTinyInt())
    })

  it('encrypted small int via proc',
    async function handler () {
      await runProc(new FieldBuilderSmallInt())
    })

  it('encrypted small int via table',
    async function handler () {
      await runTable(new FieldBuilderSmallInt())
    })

  it('encrypted int via proc',
    async function handler () {
      await runProc(new FieldBuilderInt())
    })

  it('encrypted int via table',
    async function handler () {
      await runTable(new FieldBuilderInt())
    })
})
