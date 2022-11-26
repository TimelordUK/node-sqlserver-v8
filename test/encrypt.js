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

  const encrptKey = 'CEK_Auto1'
  const encrptAlgo = 'AEAD_AES_256_CBC_HMAC_SHA_256'

  const fieldWithEncrpyt = `ENCRYPTED WITH 
  (COLUMN_ENCRYPTION_KEY = [${encrptKey}], 
  ENCRYPTION_TYPE = Deterministic, 
  ALGORITHM = '${encrptAlgo}')`

  const txtWithEncrypt = `COLLATE Latin1_General_BIN2 ${fieldWithEncrpyt}`

  class FieldBuilder {
    tableName = null
    procName = null
    constructor () {
      this.tableName = 'test_encrpted_table'
      this.procName = `proc_insert_${this.tableName}`
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
      const { id, ...first } = res.first[0]
      return first
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

    async testTable (rows) {
      rows = rows || 50
      const vec = Array(rows).fill(0).map((_, i) => {
        const builder = this.fieldBuilder
        return {
          field: builder.makeValue(i)
        }
      })
      const promises = this.table.promises
      await promises.insert(vec)
      const res2 = await env.theConnection.promises.query(`select field from ${this.fieldBuilder.tableName} `)
      expect(res2.first.length).to.equals(vec.length)
      for (let i = 0; i < vec.length; ++i) {
        this.fieldBuilder.checkEqual(res2.first[i], vec[i])
      }
    }

    async testProc () {
      const procParams = {
        field: this.fieldBuilder.makeValue(0)
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
      expect(lhs.field).closeTo(rhs.field, 1e-5)
    }

    build (builder) {
      builder.addColumn('field').asFloat().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asReal().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asNumeric(20, 15).withDecorator(fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? this.value
        : -this.value
    }
  }
  class FieldBuilderDecimal extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asDecimal(20, 18).withDecorator(fieldWithEncrpyt)
    }

    makeValue (i) {
      const divisor = ((i % 10) + 1) * 2
      return 12.123456789 / divisor
    }
  }
  class FieldBuilderBit extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBit().withDecorator(fieldWithEncrpyt)
    }

    makeValue (i) {
      return i % 2 === 0
    }
  }
  class FieldBuilderBigInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBigInt().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asTinyInt().withDecorator(fieldWithEncrpyt)
    }

    makeValue (i) {
      const addition = (i % 10)
      const v = (200 + addition) % 255
      return v
    }
  }
  class FieldBuilderInt extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asInt().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asSmallInt().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asChar(10).withDecorator(txtWithEncrypt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? '0123456789'
        : '9876543220'
    }
  }
  class FieldBuilderNVarChar extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asNVarChar(50).withDecorator(txtWithEncrypt)
    }

    makeValue (i) {
      return i % 2 === 0
        ? 'hello world!'
        : 'goodbye cruel world!'
    }
  }
  class FieldBuilderVarBinary extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asVarBinary(50).withDecorator(fieldWithEncrpyt)
    }

    makeValue () {
      return Buffer.from('5AE178', 'hex')
    }
  }
  class FieldBuilderBinary extends FieldBuilder {
    build (builder) {
      builder.addColumn('field').asBinary(3).withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asDate().withDecorator(fieldWithEncrpyt)
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
      builder.addColumn('field').asDateTime2().withDecorator(fieldWithEncrpyt)
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
    constructor (val) {
      super()
      this.value = val || env.timeHelper.getUTCTime1900HHMMSSMS(new Date())
    }

    build (builder) {
      builder.addColumn('field').asTime().withDecorator(fieldWithEncrpyt)
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

  it('encrypted time via proc', async function handler () {
    await runProc(new FieldBuilderTime())
  })

  it('encrypted time array via table', async function handler () {
    await runTable(new FieldBuilderTime())
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

  it('encrypted float via proc', async function handler () {
    await runProc(new FieldBuilderFloat())
  })

  /*
  it('encrypted float via table', async function handler () {
    await runTable(new FieldBuilderFloat())
  })
  */

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
