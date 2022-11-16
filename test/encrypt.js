'use strict'

/* globals describe it */

const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const { EOL } = require('os')

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

  const encrptKey = 'CEK_Auto1'
  const encrptAlgo = 'AEAD_AES_256_CBC_HMAC_SHA_256'

  const fieldWithEncrpyt =  `ENCRYPTED WITH 
  (COLUMN_ENCRYPTION_KEY = [${encrptKey}], 
  ENCRYPTION_TYPE = Deterministic, 
  ALGORITHM = '${encrptAlgo}')`

  const txtWithEncrypt = `COLLATE Latin1_General_BIN2 ${fieldWithEncrpyt}`


  class FieldBuilder
  {
    tableName = null
    procName = null
    constructor (tableName) {
      this.tableName = tableName || 'test_encrpted_table'
      this.procName = `proc_insert_${this.tableName}`
    }
    checkEqual(lhs, rhs) {
      expect(lhs).to.deep.equals(rhs)
    }
    build(builder) {}
    makeValue() {}
  }

  class EncryptionFieldTester {
    builder = null
    fieldBuilder = null

/*
  CREATE TABLE [dbo].[test_encrpted_table](
    [id] [int] IDENTITY(1,1) NOT NULL,
    [field] [real] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NULL
  ) ON [PRIMARY]
 */

/*
    create procedure proc_insert_test_encrpted_table
    (
      @field float (8)
    )
    as
    begin
      declare @ae_field float (8)  = @field
      insert into test_encrpted_table (field)
      output inserted.*
      values (@ae_field)
    end
 */

    makeProcSql () {
      const procname = this.fieldBuilder.procName
      const tableName = this.fieldBuilder.tableName
      const builder = this.builder

      const cnl = `, ${EOL}\t\t`
      const nl = `${EOL}\t\t`
      const insertColumns = builder.columns.filter(c => !c.isReadOnly())
      const params = insertColumns.map(c => `@${c.name} ${c.procTyped()}`).join(cnl)
      const declare = insertColumns.map(c => `declare @ae_${c.name} ${c.procTyped()} = @${c.name}`).join(nl)
      const paramNames = insertColumns.map(c => `${c.name}`).join(', ')
      const declareNames = insertColumns.map(c => `@ae_${c.name}`).join(', ')
      const insert = `insert into ${tableName} (${paramNames})`
      const values = `values (${declareNames})`
      const sql2 = `create procedure ${procname}
    ( 
      ${params}
    )
    as
    begin
      ${declare}
      ${insert}
      output inserted.*
      ${values}
    end
    `
      return sql2
    }

    constructor (fieldBuilder) {
      this.fieldBuilder = fieldBuilder
    }

    async makeBuilder () {
      const mgr = env.theConnection.tableMgr()
      const dbName = await env.getDbName()
      const builder = mgr.makeBuilder(this.fieldBuilder.tableName, dbName)
      builder.addColumn('id').asInt().isIdentity(1, 1).notNull()
      this.fieldBuilder.build(builder)
      builder.toTable()
      return builder
    }

    noID (res) {
      const { id, ...first } = res.first[0]
      return first
    }

    async prepare () {
      const procname = this.fieldBuilder.procName
      this.builder = await this.makeBuilder()
      const builder = this.builder
      await builder.drop()
      await builder.create()
      const procSql = this.makeProcSql()

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

    async test() {
      const procParams = {
        field: this.fieldBuilder.makeValue()
      }
      const procname = this.fieldBuilder.procName
      const promises = env.theConnection.promises
      const res = await promises.callProc(procname, procParams)
      this.fieldBuilder.checkEqual(this.noID(res), procParams)
      const res2 = await promises.query(`select * from ${this.fieldBuilder.tableName} `)
      this.fieldBuilder.checkEqual(this.noID(res2), procParams)
    }
  }
  class FieldBuilderFloat extends FieldBuilder {
    constructor (val) {
      super()
      this.value = val || 12.1234
    }

    checkEqual (lhs, rhs) {
      expect(lhs.field).closeTo(rhs.field,  1e-5)
    }

    build(builder) {
      builder.addColumn('field').asFloat().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return this.value
    }
  }
  class FieldBuilderNumeric extends FieldBuilder {
    constructor (val) {
      super()
      this.value = val || 12.12345678901234
    }

    checkEqual (lhs, rhs) {
      expect(lhs.field).closeTo(rhs.field,  1e-7)
    }

    build(builder) {
      builder.addColumn('field').asNumeric(20,15).withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return this.value
    }
  }
  class FieldBuilderDecimal extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asDecimal(20,18).withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return 12.123456789
    }
  }
  class FieldBuilderBit extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asBit().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return true
    }
  }
  class FieldBuilderBigInt extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asBigInt().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return 1234567890123
    }
  }
  class FieldBuilderTinyInt extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asTinyInt().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return 120
    }
  }
  class FieldBuilderInt extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asInt().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return 12345
    }
  }
  class FieldBuilderSmallInt extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asSmallInt().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return 1234
    }
  }
  class FieldBuilderChar extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asChar(10).withDecorator(txtWithEncrypt)
    }
    makeValue() {
      return '0123456789'
    }
  }
  class FieldBuilderNVarChar extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asNVarChar(50).withDecorator(txtWithEncrypt)
    }
    makeValue() {
      return 'hello world!'
    }
  }
  class FieldBuilderVarBinary extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asVarBinary(50).withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return  Buffer.from('5AE178', 'hex')
    }
  }
  class FieldBuilderBinary extends FieldBuilder {
    constructor (tableName) {
      super(tableName)
    }

    build(builder) {
      builder.addColumn('field').asBinary(3).withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return  Buffer.from('5AE178', 'hex')
    }
  }
  class FieldBuilderDateTime2 extends FieldBuilder {
    value = null
    constructor (val) {
      super()
      this.value = val || env.timeHelper.getUTCDateHH(new Date())
    }

    build(builder) {
      builder.addColumn('field').asDateTime2().withDecorator(fieldWithEncrpyt)
    }
    makeValue() {
      return this.value
    }
  }

  async function run (fieldBuilder) {
    if (!env.isEncryptedConnection()) return

    const tester = new EncryptionFieldTester(fieldBuilder)
    await tester.prepare()
    await tester.test()
  }

  it('encrypted float', async function handler () {
    await run (new FieldBuilderFloat())
  })

  it('encrypted UTC datetime2', async function handler () {
    await run (new FieldBuilderDateTime2())
  })

  it('encrypted numeric -12.12345 via proc',
    async function handler () {
      await run (new FieldBuilderNumeric(12.12345))
  })

  it('encrypted numeric 12.12345 via proc',
    async function handler () {
      await run(new FieldBuilderNumeric(12.12345))
    })

  it('encrypted numeric 12.12345678901234 via proc',
    async function handler () {
      await run(new FieldBuilderNumeric())
  })

  it('encrypted binary via proc',
    async function handler () {
      await run(new FieldBuilderBinary())
    })

  it('encrypted varbinary via proc',
    async function handler () {
      await run(new FieldBuilderVarBinary())
    })

  it('encrypted decimal via proc',
    async function handler () {
      await run(new FieldBuilderDecimal())
    })

  it('encrypted nvarchar via proc',
    async function handler () {
      await run(new FieldBuilderNVarChar())
    })

  it('encrypted char 10 via proc',
    async function handler () {
      await run(new FieldBuilderChar())
    })

  it('encrypted bit via proc',
    async function handler () {
      await run(new FieldBuilderBit())
    })

  it('encrypted big int via proc',
    async function handler () {
      await run(new FieldBuilderBigInt())
    })

  it('encrypted tiny int via proc',
    async function handler () {
      await run(new FieldBuilderTinyInt())
    })

  it('encrypted small int via proc',
    async function handler () {
      await run(new FieldBuilderSmallInt())
    })

  it('encrypted int via proc',
    async function handler () {
      await run(new FieldBuilderInt())
    })
})
