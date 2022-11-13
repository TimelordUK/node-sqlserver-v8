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

  const txtWithEncrypt = 'COLLATE Latin1_General_BIN2 ENCRYPTED WITH (' +
    'COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ' +
    'ENCRYPTION_TYPE = Deterministic, ' +
    'ALGORITHM = \'AEAD_AES_256_CBC_HMAC_SHA_256\'' +
    ')'

    const fieldWithEncrpyt =  'ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ' +
      'ENCRYPTION_TYPE = Deterministic, ALGORITHM = \'AEAD_AES_256_CBC_HMAC_SHA_256\')'


  class FieldBuilder
  {
    tableName = null
    procName = null
    constructor (tableName) {
      this.tableName = tableName || 'test_encrpted_table'
      this.procName = `proc_insert_${tableName}`
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
      const { EOL } = require('os')
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
