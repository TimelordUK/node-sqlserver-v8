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
    build(builder) {}
    makeValue() {}
  }

  class EncryptionFieldTester {
    builder = null
    fieldBuilder = null

    makeProcSql () {
      const procname = this.fieldBuilder.procName
      const tableName = this.fieldBuilder.tableName
      const builder = this.builder

      const cnl = `, ${EOL}\t\t`
      const nl = `${EOL}\t\t`
      const insertColumns = builder.columns.filter(c => !c.is_identity)
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
      expect(this.noID(res)).to.deep.equals(procParams)
      const res2 = await promises.query(`select * from ${this.fieldBuilder.tableName} `)
      expect(this.noID(res2)).to.deep.equals(procParams)
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

  it('encrypted binary via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderBinary())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted varbinary via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderVarBinary())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted decimal via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderDecimal())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted nvarchar via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderNVarChar())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted char 10 via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderChar())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted bit via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderBit())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted big int via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderBigInt())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted tiny int via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderTinyInt())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted small int via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderSmallInt())
      await tester.prepare()
      await tester.test()
    })

  it('encrypted int via proc',
    async function handler () {
      if (!env.isEncryptedConnection()) return

      const tester = new EncryptionFieldTester(new FieldBuilderInt())
      await tester.prepare()
      await tester.test()
    })
})
