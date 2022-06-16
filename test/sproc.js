'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const util = require('util')

describe('sproc', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  // this will be either Pool or connection
  function promisedCallProc (connectionProxy, spName, o) {
    return new Promise((resolve, reject) => {
      const allResults = []
      connectionProxy.callproc(spName, o, (err, results, output, more) => {
        if (err) {
          reject(err)
        } else {
          allResults.push(results)
          if (!more) {
            const selects = allResults.reduce((agg, latest) => {
              if (latest.length > 0) {
                agg.push(latest[0])
              }
              return agg
            }, [])
            resolve({
              results: selects,
              output
            })
          }
        }
      })
    })
  }

  async function t1 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const def = `alter PROCEDURE <name> (
      @a INT = ${a},
      @b INT = ${b},
      @plus INT out
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`

    await env.promisedCreate(spName, def)
    const expected = [
      0,
      a + b
    ]
    const o = {}
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  function usePoolCallProc (testfn, iterations, testDone) {
    const size = 4
    const pool = env.pool(size)

    pool.on('error', e => {
      assert.ifError(e)
    })
    pool.promises.open().then(() => {
      testfn(pool, iterations, () => {
        pool.close(() => {
          testDone()
        })
      })
    })
  }

  async function usePoolCallProcAsync (testfn, iterations) {
    const size = 4
    const pool = env.pool(size)
    await pool.promises.open()
    pool.on('error', e => {
      throw e
    })
    await testfn(pool, iterations)
    await pool.promises.close()
  }

  it('pool: two optional parameters override second set output to sum', async function handler () {
    await usePoolCallProcAsync(t1, 5)
  })

  it('connection: two optional parameters override second set output to sum', async function handler () {
    await t1(env.theConnection, 1)
  })

  async function t2 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 20
    const def = `alter PROCEDURE <name> (
      @t1 INT out,
      @t2 INT out,
      @t3 INT out,
      @a INT = ${a}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @t1 = @a;
      set @t2 = @a * 2;
      set @t3 = @a * 3;
    end;
`

    await env.promisedCreate(spName, def)
    const expected = [
      0,
      a,
      a * 2,
      a * 3
    ]

    const o = {}
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: one default input, three output parameters', async function handler () {
    await usePoolCallProcAsync(t2, 5)
  })

  it('connection: one default input, three output parameters', async function handler () {
    await t2(env.theConnection, 1)
  })

  async function t3 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 20
    const override = 30
    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT = ${a},
      @b INT
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`
    try {
      await env.promisedCreate(spName, def)
    } catch (e) {
      assert.ifError(e)
    }
    const o = {
      a: override
    }
    const errors = []

    for (let i = 0; i < iterations; ++i) {
      try {
        const res = await promisedCallProc(connectionProxy, spName, o)
        assert(res)
      } catch (e) {
        errors.push(e)
      }
    }
    assert.deepStrictEqual(iterations, errors.length)
  }

  it('pool: two parameters 1 optional set output to sum - omit required expect error', async function handler () {
    await usePoolCallProcAsync(t3, 5)
  })

  it('connection: two parameters 1 optional set output to sum - omit required expect error', async function handler () {
    await t3(env.theConnection, 1)
  })

  async function t4 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const anew = 30
    const bnew = 40
    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT = ${a},
      @b INT = ${b}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`

    await env.promisedCreate(spName, def)
    const expected = [
      0,
      anew + bnew
    ]
    const o = {
      a: anew,
      b: bnew
    }
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: two optional parameters override both set output to sum', async function handler () {
    await usePoolCallProcAsync(t4, 5)
  })

  it('connection: two optional parameters override both set output to sum', async function handler () {
    await t4(env.theConnection, 1)
  })

  /*
  async function t5 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const def = `alter PROCEDURE ${spName} (
      @plus INT out,
      @a INT = ${a},
      @A INT = ${b}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @A;
    end;
`
    const expectedError = new Error('[Microsoft][' + driver + '][SQL Server]The variable name \'@A\' has already been declared. Variable names must be unique within a query batch or stored procedure.')
    expectedError.sqlstate = '42000'
    expectedError.code = 134
    expectedError.severity = 15
    expectedError.procName = spName
    expectedError.lineNumber = 5

    try {
      await env.promisedCreateIfNotExist(spName)
    } catch (e) {
      assert.ifError(e)
    }
    const errors = []
    const promisedQuery = util.promisify(connectionProxy.query)
    for (let i = 0; i < iterations; ++i) {
      try {
        const res = await promisedQuery(def)
        assert(res)
      } catch (e) {
        assert(e.serverName.length > 0)
        delete e.serverName
        errors.push(e)
      }
    }
    assert.deepStrictEqual(iterations, errors.length)
    errors.forEach(err => {
      assert.deepStrictEqual(err, expectedError, 'Unexpected error returned')
    })
    testDone()
  }

  it('pool: two parameters same name mixed case - should error', testDone => {
    usePoolCallProc(t5, 5, testDone)
  })

  it('connection: two parameters same name mixed case - should error', testDone => {
    t5(env.theConnection, 1, testDone)
  }) */

  async function t6 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT = ${a},
      @b INT = ${b}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`
    await env.promisedCreate(spName, def)
    const expected = [
      0,
      a + b
    ]
    const o = {}
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: two optional parameters set output to sum no input params', async function handler () {
    await usePoolCallProcAsync(t6, 5)
  })

  it('connection: two optional parameters set output to sum no input params', async function handler () {
    await t6(env.theConnection, 1)
  })

  async function t7 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const override = 30
    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT = ${a},
      @b INT = ${b}
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`
    await env.promisedCreate(spName, def)
    const o = {
      a: override
    }
    const expected = [
      0,
      override + b
    ]
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: two optional parameters override first set output to sum', async function handler () {
    await usePoolCallProcAsync(t7, 5)
  })

  it('connection: two optional parameters override first set output to sum', async function handler () {
    t7(env.theConnection, 1)
  })

  async function t8 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'

    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT,
      @b INT,
      @c INT = 0
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b + @c;
    end;
`
    await env.promisedCreate(spName, def)
    const o = {
      a: 2,
      b: 3,
      c: 4
    }
    const expected = [
      0,
      o.a + o.b + o.c
    ]
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: 2 input, 1 optional parameter override set output to sum of 3', async function handler () {
    await usePoolCallProcAsync(t8, 5)
  })

  it('connection: 2 input, 1 optional parameter override set output to sum of 3', async function handler () {
    await t8(env.theConnection, 1)
  })

  async function t9 (connectionProxy, iterations) {
    const spName = 'test_sp_get_optional_p'

    const def = `alter PROCEDURE <name> (
      @plus INT out,
      @a INT,
      @b INT,
      @c INT = 0
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b + @c;
    end;
`
    await env.promisedCreate(spName, def)
    const o = {
      a: 2,
      b: 3
    }
    const expected = [
      0,
      o.a + o.b
    ]
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: 2 input, 1 optional default parameters set output to sum of 3', async function handler () {
    await usePoolCallProcAsync(t9, 5)
  })

  it('connection: 2 input, 1 optional default parameters set output to sum of 3', async function handler () {
    await t9(env.theConnection, 1)
  })

  async function t10 (connectionProxy, iterations) {
    const spName = 'test_sp_get_in_out_p'

    const def = `alter PROCEDURE <name> (
      @a INT,
      @plus INT out
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @plus;
    end;
`
    try {
      await env.promisedCreate(spName, def)
    } catch (e) {
      assert.ifError(e)
    }
    const o = {
    }
    const errors = []

    for (let i = 0; i < iterations; ++i) {
      try {
        const res = await promisedCallProc(connectionProxy, spName, o)
        assert(res)
      } catch (e) {
        errors.push(e)
      }
    }
    assert.deepStrictEqual(iterations, errors.length)
  }

  it('pool: omit required parameter expect error', async function handler () {
    await usePoolCallProcAsync(t10, 5)
  })

  it('connection: omit required parameter expect error', async function handler () {
    await t10(env.theConnection, 1)
  })

  async function t11 (connectionProxy, iterations) {
    const spName = 'test_sp_get_in_out_p'

    const def = `alter PROCEDURE <name> (
      @a INT,
      @plus INT out
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @plus;
    end;
`
    try {
      await env.promisedCreate(spName, def)
    } catch (e) {
      assert.ifError(e)
    }
    const o = {
      a: 2,
      illegal: 4
    }
    const errors = []

    for (let i = 0; i < iterations; ++i) {
      try {
        const res = await promisedCallProc(connectionProxy, spName, o)
        assert(res)
      } catch (e) {
        errors.push(e)
      }
    }
    assert.deepStrictEqual(iterations, errors.length)
  }

  it('pool: add illegal parameter expect error', async function handler () {
    await usePoolCallProcAsync(t11, 5)
  })

  it('connection: add illegal parameter expect error', async function handler () {
    await t11(env.theConnection, 1)
  })

  async function t12 (connectionProxy, iterations) {
    const spName = 'test_sp_get_in_out_p'

    const def = `alter PROCEDURE <name> (
      @a INT,
      @plus INT out
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @plus;
    end;
`
    await env.promisedCreate(spName, def)
    const o = {
      a: 2,
      plus: 3
    }
    const expected = [
      0,
      o.a + o.plus
    ]
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: use input output parameters i.e. use a param as both input and output', async function handler () {
    await usePoolCallProcAsync(t12, 5)
  })

  it('connection: use input output parameters i.e. use a param as both input and output', async function handler () {
    await t12(env.theConnection, 1)
  })

  async function t13 (connectionProxy, iterations) {
    const spName = 'test_sp_get_in_out_p'

    const def = `alter PROCEDURE <name> (
      @a INT,
      @plus_in INT out,
      @plus_out INT out
    )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus_out = @a + @plus_in;
    end;
  `
    await env.promisedCreate(spName, def)
    const o = {
      a: 2,
      plus_in: 3
    }
    const expected = [
      0,
      o.plus_in,
      o.a + o.plus_in
    ]
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      const output = res.output
      if (output) {
        assert(Array.isArray(output))
        assert.deepStrictEqual(expected, output)
      }
    }
  }

  it('pool: two in out params use first as input only second output only', async function handler () {
    await usePoolCallProcAsync(t13, 5)
  })

  it('connection: two in out params use first as input only second output only', async function handler () {
    await t13(env.theConnection, 1)
  })

  async function t14 (connectionProxy, iterations) {
    const spName = 'test_sp_i_do_not_exist'

    const errors = []

    for (let i = 0; i < iterations; ++i) {
      try {
        const res = await promisedCallProc(connectionProxy, spName, [1, 'NI123456', 'Programmer01'])
        assert(res)
      } catch (e) {
        errors.push(e)
      }
    }
    assert.deepStrictEqual(iterations, errors.length)
  }

  it('pool: test non existant sproc', async function handler () {
    await usePoolCallProcAsync(t14, 5)
  })

  it('connection: test non existant sproc', async function handler () {
    await t14(env.theConnection, 1)
  })

  async function t15 (connectionProxy, iterations) {
    const spName = 'test_sp_get_int_int'

    const def = `alter PROCEDURE <name> (
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`
    await env.promisedCreate(spName, def)

    function check (received) {
      for (let i = 0; i < iterations; ++i) {
        const expected = [99, i * 2]
        assert.deepStrictEqual(received[i], expected, 'results didn\'t match')
      }
    }

    const promises = []
    for (let i = 0; i < iterations; ++i) {
      const o = {
        num1: i,
        num2: i
      }
      promises.push(promisedCallProc(connectionProxy, spName, o))
    }
    Promise.all(promises).then(received => {
      check(received.map(v => v.output))
    })
  }

  it('pool: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', async function handler () {
    await usePoolCallProcAsync(t15, 150)
  })

  it('connection: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', async function handler () {
    await t15(env.theConnection, 100)
  })

  async function t16 (connectionProxy, iterations) {
    const promisedQueryRaw = connectionProxy.promises.query

    const spName = 'test_sp_multi_statement'

    const def = `alter PROCEDURE <name>(
@p1 INT,
@p2 nvarchar(15),
@p3 nvarchar(256)

)AS
BEGIN
    insert into TestMultiStatement (BusinessEntityID, NationalIDNumber, LoginID) values (@p1, @p2, @p3)
    
    update TestMultiStatement set BusinessEntityID = 100 where BusinessEntityID = @p1
    
    delete from TestMultiStatement where BusinessEntityID = 100 
END
`
    const tname = 'TestMultiStatement'
    const dropTableSql = `IF OBJECT_ID(N'dbo.${tname}', N'U') IS NOT NULL
      BEGIN
        DROP TABLE ${tname}
      END`
    const createTable = `CREATE TABLE ${tname} (
        [BusinessEntityID] [int] NOT NULL,
        [NationalIDNumber] [nvarchar](15) NOT NULL,
        [LoginID] [nvarchar](256) NOT NULL
        )`
    await promisedQueryRaw(dropTableSql)
    await promisedQueryRaw(createTable)
    await env.promisedCreate(spName, def)

    const o = {
      p1: 1,
      p2: 'NI123456',
      p3: 'Programmer01'
    }

    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      assert(res)
    }
  }

  it('pool: insert/update/delete synchronously ', async function handler () {
    await usePoolCallProcAsync(t16, 5)
  })

  it('connection: insert/update/delete synchronously ', async function handler () {
    await t16(env.theConnection, 1)
  })

  async function t17 (connectionProxy, iterations) {
    const spName = 'test_sp_get_int_int'

    const def = `alter PROCEDURE <name> (
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`
    await env.promisedCreate(spName, def)

    function check (received) {
      for (let i = 0; i < iterations; ++i) {
        const expected = [99, i * 2]
        assert.deepStrictEqual(received[i], expected, 'results didn\'t match')
      }
    }

    const received = []
    for (let i = 0; i < iterations; ++i) {
      const o = {
        num1: i,
        num2: i
      }
      received.push(await promisedCallProc(connectionProxy, spName, o))
    }
    check(received.map(v => v.output))
  }

  it('pool: get proc and call multiple times synchronously with changing params i.e. prove each call is independent', async function handler () {
    await usePoolCallProcAsync(t17, 5)
  })

  it('connection: get proc and call multiple times synchronously with changing params i.e. prove each call is independent', async function handler () {
    await t17(env.theConnection, 1)
  })

  async function t18 (connectionProxy, iterations) {
    const promisedQueryRaw = connectionProxy.promises.query
    const newBusinessId = 100
    const NationalIDNumber = 'NI123456'
    const loginId = 'Programmer01'
    const spName = 'test_sp_multi_statement'

    const def = `alter PROCEDURE <name>(
@p1 INT,
@p2 nvarchar(15),
@p3 nvarchar(256)

)AS
BEGIN
    insert into TestMultiStatement (BusinessEntityID, NationalIDNumber, LoginID) values (@p1, @p2, @p3)
    
    select BusinessEntityID, NationalIDNumber, LoginID from TestMultiStatement

    update TestMultiStatement set BusinessEntityID = ${newBusinessId} where BusinessEntityID = @p1

    select BusinessEntityID, NationalIDNumber, LoginID from TestMultiStatement
    
    delete from TestMultiStatement where BusinessEntityID = ${newBusinessId}
END
`
    const tname = 'TestMultiStatement'
    const dropTableSql = `IF OBJECT_ID(N'dbo.${tname}', N'U') IS NOT NULL
      BEGIN
        DROP TABLE ${tname}
      END`
    const createTable = `CREATE TABLE ${tname} (
        [BusinessEntityID] [int] NOT NULL,
        [NationalIDNumber] [nvarchar](15) NOT NULL,
        [LoginID] [nvarchar](256) NOT NULL
        )`
    await promisedQueryRaw(dropTableSql)
    await promisedQueryRaw(createTable)
    await env.promisedCreate(spName, def)

    const o = {
      p1: 1,
      p2: NationalIDNumber,
      p3: loginId
    }

    const expected = [
      {
        BusinessEntityID: 1,
        NationalIDNumber,
        LoginID: loginId
      },
      {
        BusinessEntityID: newBusinessId,
        NationalIDNumber,
        LoginID: loginId
      }
    ]

    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, o)
      assert(res)
      assert.deepStrictEqual(2, res.results.length)
      assert.deepStrictEqual(res.results, expected)
    }
  }

  it('pool: async call proc with changing params - include multiple select in sproc', async function handler () {
    await usePoolCallProcAsync(t18, 5)
  })

  it('connection: async call proc with changing params - include multiple select in sproc', async function handler () {
    await t18(env.theConnection, 1)
  })

  async function t19 (connectionProxy, iterations) {
    const spName = 'test_sp_select_select'

    const def = `alter PROCEDURE <name>
AS
BEGIN
    select top 5 'syscolumns' as table_name, name, id, xtype, length from syscolumns
    select top 5 'sysobjects' as table_name, name, id, xtype, category from sysobjects
END
`
    await env.promisedCreate(spName, def)

    for (let i = 0; i < iterations; ++i) {
      const res = await promisedCallProc(connectionProxy, spName, [])
      assert(res)
      assert.deepStrictEqual(2, res.results.length)
    }
  }

  it('pool: proc with multiple select  - should callback with each', async function handler () {
    await usePoolCallProcAsync(t19, 5)
  })

  it('connection: proc with multiple select  - should callback with each', async function handler () {
    await t19(env.theConnection, 1)
  })

  it('proc with multiple select  - should callback with each', async function handler () {
    const spName = 'test_sp_select_select'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
BEGIN
    select top 5 'syscolumns' as table_name, name, id, xtype, length from syscolumns
    select top 5 'sysobjects' as table_name, name, id, xtype, category from sysobjects
END
END
`
    await env.promisedCreate(spName, def)
    const pm = env.theConnection.procedureMgr()
    const proc = await env.theConnection.promises.getProc(spName)

    const count = pm.getCount()
    assert.strictEqual(count, 1)
    const aggregate = []
    const reducer = (arr) => {
      return arr.reduce((t, latest) => {
        t.push(latest.table_name)
        return t
      }, [])
    }

    function runner () {
      return new Promise((resolve, reject) => {
        proc.call([], (err, results, output) => {
          if (err) {
            reject(err)
          }
          aggregate.push(results)
          if (output) {
            assert.strictEqual(2, aggregate.length, 'results didn\'t match')
            assert.strictEqual(true, Array.isArray(aggregate[0]))
            assert.strictEqual(true, Array.isArray(aggregate[1]))
            const tableNames0 = reducer(aggregate[0])
            tableNames0.forEach(s => {
              assert.strictEqual('syscolumns', s)
            })
            const tableNames1 = reducer(aggregate[1])
            tableNames1.forEach(s => {
              assert.strictEqual('sysobjects', s)
            })
            resolve(null)
          }
        })
      })
    }
    await runner()
  })

  it('check proc called as object paramater where converting via utility method', testDone => {
    const spName = 'test_sp_select_select'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`

    const fns = [
      asyncDone => {
        env.procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.get(spName, proc => {
          const count = pm.getCount()
          assert.strictEqual(count, 1)
          const o = {
            num1: 10,
            num2: 100
          }
          const p = proc.paramsArray(o)
          proc.call(p, (err, results, output) => {
            assert.ifError(err)
            if (output) {
              assert(Array.isArray(output))
              const expected = [
                99,
                o.num1 + o.num2
              ]
              assert.deepStrictEqual(expected, output)
              asyncDone()
            }
          })
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  async function t20 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_select_select'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`

    try {
      await env.promisedCreate(spName, def)
      const o = {
        num1: 10,
        num2: 100
      }
      const expected = [
        99,
        o.num1 + o.num2
      ]
      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, o)
        const output = res.output
        if (output) {
          assert(Array.isArray(output))
          assert.deepStrictEqual(expected, output)
        }
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: check proc called as object paramater where vals sent as attributes', testDone => {
    usePoolCallProc(t20, 5, testDone)
  })

  it('connection: check proc called as object paramater where vals sent as attributes', testDone => {
    t20(env.theConnection, 1, testDone)
  })

  async function t21 (connectionProxy, iterations, testDone) {
    const spName = 'test_len_of_sp'

    const def = `alter PROCEDURE <name> @param VARCHAR(50) 
 AS 
 BEGIN 
     raiserror('a print in proc message',0,0) with nowait;
     select LEN(@param) as len; 
 END 
`
    try {
      await env.promisedCreate(spName, def)
      const o = {
        param: 'javascript'
      }
      const expected = [
        [
          10
        ]
      ]
      for (let i = 0; i < iterations; ++i) {
        const res = await streamingPromise(connectionProxy, spName, o)
        const rows = res.rows
        assert(rows.length === 1)
        assert(res.info.length === 1)
        assert(res.info[0].includes('a print in proc message'))
        assert.deepStrictEqual(expected, rows)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  function streamingPromise (connectionProxy, proc, params) {
    return new Promise((resolve, reject) => {
      let submitted = false
      let meta = null
      const rows = []
      const info = []
      let row
      const qp = connectionProxy.callproc(proc, params)
      qp.on('column', (c, data) => {
        row[c] = data
        if (c === meta.length - 1) {
          rows.push(row)
          row = [meta.length]
        }
      })

      qp.on('meta', (m) => {
        meta = m
        row = [meta.length]
      })

      qp.on('free', () => {
        // console.log('done ....')
        assert.strictEqual(true, submitted)
        resolve({
          rows,
          info
        })
      })

      qp.on('error', (e) => {
        reject(e)
      })

      qp.on('submitted', (q) => {
        // console.log('submitted')
        submitted = true
      })

      qp.on('info', (i) => {
        // console.log(`info ${i}`)
        info.push(i.message)
      })
    })
  }

  it('pool: stream call proc no callback with print in proc', testDone => {
    usePoolCallProc(t21, 5, testDone)
  })

  it('connection: stream call proc no callback with print in proc', testDone => {
    t21(env.theConnection, 1, testDone)
  })

  async function t23 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_get_str_str'

    const def = `alter PROCEDURE <name>(
@id INT,
@name varchar(20) OUTPUT,
@company varchar(20) OUTPUT

)AS
BEGIN
   SET @name = 'name'
   SET @company = 'company'
   RETURN 99;
END
`
    try {
      await env.promisedCreate(spName, def)
      const p = [1]
      const expected = [99, 'name', 'company']
      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, p)
        const output = res.output
        if (output) {
          assert(Array.isArray(output))
          assert.deepStrictEqual(expected, output)
        }
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: call proc that has 2 output string params + return code', testDone => {
    usePoolCallProc(t23, 5, testDone)
  })

  it('connection: call proc that has 2 output string params + return code', testDone => {
    t23(env.theConnection, 1, testDone)
  })

  async function t22 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_get_int_int'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`

    try {
      await env.promisedCreate(spName, def)
      const p = [10, 5]
      const expected = [99, 15]
      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, p)
        const output = res.output
        if (output) {
          assert(Array.isArray(output))
          assert.deepStrictEqual(expected, output)
        }
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: get proc and call  - should not error', testDone => {
    usePoolCallProc(t22, 5, testDone)
  })

  it('connection: get proc and call  - should not error', testDone => {
    t22(env.theConnection, 1, testDone)
  })

  async function t24 (connectionProxy, iterations, testDone) {
    const spName = 'test_len_of_sp'

    const def = `alter PROCEDURE <name> @param VARCHAR(50) 
 AS 
 BEGIN 
     select LEN(@param) as len; 
 END 
`
    try {
      await env.promisedCreate(spName, def)
      const o = {
        param: 'javascript'
      }
      const expected = [
        [
          10
        ]
      ]
      for (let i = 0; i < iterations; ++i) {
        const res = await streamingPromise(connectionProxy, spName, o)
        const rows = res.rows
        assert(rows.length === 1)
        assert(res.info.length === 0)
        assert.deepStrictEqual(expected, rows)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: stream call proc no callback', testDone => {
    usePoolCallProc(t24, 5, testDone)
  })

  it('connection: stream call proc no callback', testDone => {
    t24(env.theConnection, 1, testDone)
  })

  const waitProcDef = `alter PROCEDURE <name>(
@timeout datetime
)AS
BEGIN
waitfor delay @timeout;END
`
  it('call proc that waits for delay of input param - wait 5, timeout 2 - should error', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        env.procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.setTimeout(2)
        pm.callproc(spName, ['0:0:5'], err => {
          assert(err)
          assert(err.message.includes('Query timeout expired'))
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('call proc error with timeout then query on same connection', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        env.procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.setTimeout(2)
        pm.callproc(spName, ['0:0:5'], err => {
          assert(err)
          assert(err.message.includes('Query timeout expired'))
          asyncDone()
        })
      },

      asyncDone => {
        const expected = [
          {
            n: 1
          }]
        env.sql.query(env.connectionString, 'SELECT 1 as n', (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  async function t25 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp'

    const def = `alter PROCEDURE <name> @param VARCHAR(50) 
 AS 
 BEGIN 
     SELECT name, type, type_desc  FROM sys.objects WHERE type = 'P' AND name = '<name>'     RETURN LEN(@param); 
 END 
`
    try {
      await env.promisedCreate(spName, def)
      const p = ['US of A!']
      const expectedOutput = [8]
      const expected = [
        {
          name: spName,
          type: 'P ',
          type_desc: 'SQL_STORED_PROCEDURE'
        }]

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, p)
        assert.deepStrictEqual(res.output, expectedOutput)
        assert.deepStrictEqual(res.results, expected)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: call proc that returns length of input string and decribes itself in results', testDone => {
    usePoolCallProc(t25, 5, testDone)
  })

  it('connection: call proc that returns length of input string and decribes itself in results', testDone => {
    t25(env.theConnection, 1, testDone)
  })

  async function t26 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp'

    const def = `alter PROCEDURE <name> @param VARCHAR(50) 
 AS 
 BEGIN 
     RETURN LEN(@param); 
 END 
`
    try {
      await env.promisedCreate(spName, def)
      const p = ['US of A!']
      const expectedOutput = [8]

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, p)
        assert.deepStrictEqual(res.output, expectedOutput)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: call proc that returns length of input string', testDone => {
    usePoolCallProc(t26, 5, testDone)
  })

  it('connection: call proc that returns length of input string', testDone => {
    t26(env.theConnection, 1, testDone)
  })

  async function t27 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_get_int_int'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`
    try {
      await env.promisedCreate(spName, def)
      const p = [10, 5]
      const expected = [99, 15]

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, p)
        assert.deepStrictEqual(res.output, expected)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  it('pool: call proc that has 2 input params + 1 output', testDone => {
    usePoolCallProc(t27, 5, testDone)
  })

  it('connection: call proc that has 2 input params + 1 output', testDone => {
    t27(env.theConnection, 1, testDone)
  })

  async function t28 (connectionProxy, iterations) {
    const spName = 'test_sp_get_int_int'

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`
    await env.promisedCreate(spName, def)
    const p = [10, 5]
    const expected = [{
      num3: 15,
      ___return___: 99
    }]
    const promisedGet = connectionProxy.promises.getProc
    const proc = await promisedGet(spName)
    const meta = proc.getMeta()
    const s = meta.select
    const promisedQuery = util.promisify(connectionProxy.query)
    for (let i = 0; i < iterations; ++i) {
      const res = await promisedQuery(s, p)
      assert.deepStrictEqual(res, expected)
    }
  }

  it('pool: test asselect on proc', async function handler () {
    await usePoolCallProcAsync(t28, 5)
  })

  it('connection: test asselect on proc', async function handler () {
    await t28(env.theConnection, 1)
  })

  it('call proc in non-dbo schema with parameters using callproc syntax', testDone => {
    const spName = 'TestSchema.test_sp_get_int_int'

    const schemaName = 'TestSchema'
    const createSchemaSql = `IF NOT EXISTS (
    SELECT schema_name
    FROM  information_schema.schemata
    WHERE schema_name = '${schemaName}')
    BEGIN
    EXEC sp_executesql N'CREATE SCHEMA ${schemaName}'
    END`

    const def = `alter PROCEDURE <name>(
@num1 INT,
@num2 INT,
@num3 INT OUTPUT

)AS
BEGIN
   SET @num3 = @num1 + @num2
   RETURN 99;
END
`

    const fns = [

      asyncDone => {
        env.theConnection.query(createSchemaSql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.callproc(spName, [20, 8], function (err, results, output) {
          assert.ifError(err)
          const expected = [99, 28]
          assert.ok(expected[0] === output[0], "results didn't match")
          assert.ok(expected[1] === output[1], "results didn't match")
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('call proc that waits for delay of input param - wait 2, timeout 5 - should not error', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        env.procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.setTimeout(5)
        pm.callproc(spName, ['0:0:2'], err => {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })
})
