'use strict'
/* global suite teardown teardown test setup */

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')
const util = require('util')

suite('sproc', function () {
  let connStr
  let theConnection
  let driver
  let support
  let async
  let helper
  let procedureHelper
  const sql = global.native_sql
  let promisedCreate
  let promisedCreateIfNotExist

  this.timeout(60000)

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      driver = co.driver
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      promisedCreate = util.promisify(procedureHelper.createProcedure)
      promisedCreateIfNotExist = util.promisify(procedureHelper.createProcedureIfNotExist)

      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, conn) => {
        theConnection = conn
        assert(err === false)
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
              output: output
            })
          }
        }
      })
    })
  }

  async function t1 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  function usePoolCallProc (testfn, iterations, testDone) {
    const size = 4
    const pool = new sql.Pool({
      connectionString: connStr,
      ceiling: size
    })
    pool.on('error', e => {
      assert.ifError(e)
    })
    pool.open()
    testfn(pool, iterations, () => {
      pool.close(() => {
        testDone()
      })
    })
  }

  test('pool: two optional parameters override second set output to sum', testDone => {
    usePoolCallProc(t1, 5, testDone)
  })

  test('connection: two optional parameters override second set output to sum', testDone => {
    t1(theConnection, 1, testDone)
  })

  async function t2 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: one default input, three output parameters', testDone => {
    usePoolCallProc(t2, 5, testDone)
  })

  test('connection: one default input, three output parameters', testDone => {
    t2(theConnection, 1, testDone)
  })

  async function t3 (connectionProxy, iterations, testDone) {
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
      await promisedCreate(spName, def)
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
    testDone()
  }

  test('pool: two parameters 1 optional set output to sum - omit required expect error', testDone => {
    usePoolCallProc(t3, 5, testDone)
  })

  test('connection: two parameters 1 optional set output to sum - omit required expect error', testDone => {
    t3(theConnection, 1, testDone)
  })

  async function t4 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: two optional parameters override both set output to sum', testDone => {
    usePoolCallProc(t4, 5, testDone)
  })

  test('connection: two optional parameters override both set output to sum', testDone => {
    t4(theConnection, 1, testDone)
  })

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
      await promisedCreateIfNotExist(spName)
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

  /*
  test('pool: two parameters same name mixed case - should error', testDone => {
    usePoolCallProc(t5, 5, testDone)
  })

  test('connection: two parameters same name mixed case - should error', testDone => {
    t5(theConnection, 1, testDone)
  }) */

  async function t6 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
      const expected = [
        0,
        a + b
      ]
      const o = {
      }
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
  
  test('pool: two optional parameters set output to sum no input params', testDone => {
    usePoolCallProc(t6, 5, testDone)
  })

  test('connection: two optional parameters set output to sum no input params', testDone => {
    t6(theConnection, 1, testDone)
  })

  async function t7 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: two optional parameters override first set output to sum', testDone => {
    usePoolCallProc(t7, 5, testDone)
  })

  test('connection: two optional parameters override first set output to sum', testDone => {
    t7(theConnection, 1, testDone)
  })

  async function t8 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: 2 input, 1 optional parameter override set output to sum of 3', testDone => {
    usePoolCallProc(t8, 5, testDone)
  })

  test('connection: 2 input, 1 optional parameter override set output to sum of 3', testDone => {
    t8(theConnection, 1, testDone)
  })

  async function t9 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: 2 input, 1 optional default parameters set output to sum of 3', testDone => {
    usePoolCallProc(t9, 5, testDone)
  })

  test('connection: 2 input, 1 optional default parameters set output to sum of 3', testDone => {
    t9(theConnection, 1, testDone)
  })

  async function t10 (connectionProxy, iterations, testDone) {
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
      await promisedCreate(spName, def)
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
    testDone()
  }

  test('pool: omit required parameter expect error', testDone => {
    usePoolCallProc(t10, 5, testDone)
  })

  test('connection: omit required parameter expect error', testDone => {
    t10(theConnection, 1, testDone)
  })

  async function t11 (connectionProxy, iterations, testDone) {
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
      await promisedCreate(spName, def)
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
    testDone()
  }

  test('pool: add illegal parameter expect error', testDone => {
    usePoolCallProc(t11, 5, testDone)
  })

  test('connection: add illegal parameter expect error', testDone => {
    t11(theConnection, 1, testDone)
  })

  async function t12 (connectionProxy, iterations, testDone) {
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
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: use input output parameters i.e. use a param as both input and output', testDone => {
    usePoolCallProc(t12, 5, testDone)
  })

  test('connection: use input output parameters i.e. use a param as both input and output', testDone => {
    t12(theConnection, 1, testDone)
  })

  async function t13 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)
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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: two in out params use first as input only second output only', testDone => {
    usePoolCallProc(t13, 5, testDone)
  })

  test('connection: two in out params use first as input only second output only', testDone => {
    t13(theConnection, 1, testDone)
  })

  async function t14 (connectionProxy, iterations, testDone) {
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
    testDone()
  }

  test('pool: test non existant sproc', testDone => {
    usePoolCallProc(t14, 5, testDone)
  })

  test('connection: test non existant sproc', testDone => {
    t14(theConnection, 1, testDone)
  })

  async function t15 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)

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
        testDone()
      })
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', testDone => {
    usePoolCallProc(t15, 300, testDone)
  })

  test('connection: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', testDone => {
    t15(theConnection, 300, testDone)
  })

  async function t16 (connectionProxy, iterations, testDone) {
    const promisedQueryRaw = util.promisify(connectionProxy.queryRaw)

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
    try {
      await promisedQueryRaw('DROP TABLE TestMultiStatement')
      await promisedQueryRaw(`CREATE TABLE TestMultiStatement (
        [BusinessEntityID] [int] NOT NULL,
        [NationalIDNumber] [nvarchar](15) NOT NULL,
        [LoginID] [nvarchar](256) NOT NULL,
        )`)
      await promisedCreate(spName, def)

      const o = {
        p1: 1,
        p2: 'NI123456',
        p3: 'Programmer01'
      }

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, o)
        assert(res)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', testDone => {
    usePoolCallProc(t16, 5, testDone)
  })

  test('connection: get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', testDone => {
    t16(theConnection, 1, testDone)
  })

  async function t17 (connectionProxy, iterations, testDone) {
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
    try {
      await promisedCreate(spName, def)

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
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: get proc and call multiple times synchronously with changing params i.e. prove each call is independent', testDone => {
    usePoolCallProc(t17, 5, testDone)
  })

  test('connection: get proc and call multiple times synchronously with changing params i.e. prove each call is independent', testDone => {
    t17(theConnection, 1, testDone)
  })

  async function t18 (connectionProxy, iterations, testDone) {
    const promisedQueryRaw = util.promisify(connectionProxy.queryRaw)
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
    try {
      await promisedQueryRaw('DROP TABLE TestMultiStatement')
      await promisedQueryRaw(`CREATE TABLE TestMultiStatement (
        [BusinessEntityID] [int] NOT NULL,
        [NationalIDNumber] [nvarchar](15) NOT NULL,
        [LoginID] [nvarchar](256) NOT NULL,
        )`)
      await promisedCreate(spName, def)

      const o = {
        p1: 1,
        p2: NationalIDNumber,
        p3: loginId
      }

      const expected = [
        {
          BusinessEntityID: 1,
          NationalIDNumber: NationalIDNumber,
          LoginID: loginId
        },
        {
          BusinessEntityID: newBusinessId,
          NationalIDNumber: NationalIDNumber,
          LoginID: loginId
        }
      ]

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, o)
        assert(res)
        assert.deepStrictEqual(2, res.results.length)
        assert.deepStrictEqual(res.results, expected)
      }

      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: async call proc with changing params - include multiple select in sproc', testDone => {
    usePoolCallProc(t18, 5, testDone)
  })

  test('connection: async call proc with changing params - include multiple select in sproc', testDone => {
    t18(theConnection, 1, testDone)
  })

  async function t19 (connectionProxy, iterations, testDone) {
    const spName = 'test_sp_select_select'

    const def = `alter PROCEDURE <name>
AS
BEGIN
    select top 5 'syscolumns' as table_name, name, id, xtype, length from syscolumns
    select top 5 'sysobjects' as table_name, name, id, xtype, category from sysobjects
END
`
    try {
      await promisedCreate(spName, def)

      for (let i = 0; i < iterations; ++i) {
        const res = await promisedCallProc(connectionProxy, spName, [])
        assert(res)
        assert.deepStrictEqual(2, res.results.length)
      }

      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: proc with multiple select  - should callback with each', testDone => {
    usePoolCallProc(t19, 5, testDone)
  })

  test('connection: proc with multiple select  - should callback with each', testDone => {
    t19(theConnection, 1, testDone)
  })

  test('proc with multiple select  - should callback with each', testDone => {
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

    const fns = [
      asyncDone => {
        procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get(spName, proc => {
          const count = pm.getCount()
          assert.strictEqual(count, 1)
          const aggregate = []
          const reducer = (arr) => {
            return arr.reduce((t, latest) => {
              t.push(latest.table_name)
              return t
            }, [])
          }
          proc.call([], (err, results, output) => {
            assert.ifError(err)
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
              asyncDone()
            }
          })
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('check proc called as object paramater where converting via utility method', testDone => {
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
        procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
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

    async.series(fns, () => {
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
      await promisedCreate(spName, def)
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

  test('pool: check proc called as object paramater where vals sent as attributes', testDone => {
    usePoolCallProc(t20, 5, testDone)
  })

  test('connection: check proc called as object paramater where vals sent as attributes', testDone => {
    t20(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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
          rows: rows,
          info: info
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

  test('pool: stream call proc no callback with print in proc', testDone => {
    usePoolCallProc(t21, 5, testDone)
  })

  test('connection: stream call proc no callback with print in proc', testDone => {
    t21(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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

  test('pool: call proc that has 2 output string params + return code', testDone => {
    usePoolCallProc(t23, 5, testDone)
  })

  test('connection: call proc that has 2 output string params + return code', testDone => {
    t23(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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

  test('pool: get proc and call  - should not error', testDone => {
    usePoolCallProc(t22, 5, testDone)
  })

  test('connection: get proc and call  - should not error', testDone => {
    t22(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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

  test('pool: stream call proc no callback', testDone => {
    usePoolCallProc(t24, 5, testDone)
  })

  test('connection: stream call proc no callback', testDone => {
    t24(theConnection, 1, testDone)
  })

  const waitProcDef = `alter PROCEDURE <name>(
@timeout datetime
)AS
BEGIN
waitfor delay @timeout;END
`
  test('call proc that waits for delay of input param - wait 5, timeout 2 - should error', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const expected = new Error(`[Microsoft][${driver}]Query timeout expired`)
        expected.sqlstate = 'HYT00'
        expected.code = 0
        expected.severity = 0
        expected.serverName = ''
        expected.procName = ''
        expected.lineNumber = 0
        const pm = theConnection.procedureMgr()
        pm.setTimeout(2)
        pm.callproc(spName, ['0:0:5'], err => {
          assert.deepStrictEqual(err, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('call proc error with timeout then query on same connection', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const expected = new Error(`[Microsoft][${driver}]Query timeout expired`)
        expected.sqlstate = 'HYT00'
        expected.code = 0
        expected.severity = 0
        expected.serverName = ''
        expected.procName = ''
        expected.lineNumber = 0
        const pm = theConnection.procedureMgr()
        pm.setTimeout(2)
        pm.callproc(spName, ['0:0:5'], err => {
          assert.deepStrictEqual(err, expected)
          asyncDone()
        })
      },

      asyncDone => {
        const expected = [
          {
            n: 1
          }]
        sql.query(connStr, 'SELECT 1 as n', (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
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
      await promisedCreate(spName, def)
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

  test('pool: call proc that returns length of input string and decribes itself in results', testDone => {
    usePoolCallProc(t25, 5, testDone)
  })

  test('connection: call proc that returns length of input string and decribes itself in results', testDone => {
    t25(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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

  test('pool: call proc that returns length of input string', testDone => {
    usePoolCallProc(t26, 5, testDone)
  })

  test('connection: call proc that returns length of input string', testDone => {
    t26(theConnection, 1, testDone)
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
      await promisedCreate(spName, def)
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

  test('pool: call proc that has 2 input params + 1 output', testDone => {
    usePoolCallProc(t27, 5, testDone)
  })

  test('connection: call proc that has 2 input params + 1 output', testDone => {
    t27(theConnection, 1, testDone)
  })

  async function t28 (connectionProxy, iterations, testDone) {
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
      await promisedCreate(spName, def)
      const p = [10, 5]
      const expected = [{
        num3: 15,
        ___return___: 99
      }]
      const promisedGet = util.promisify(theConnection.procedureMgr().getProc)
      const proc = await promisedGet(spName)
      const meta = proc.getMeta()
      const s = meta.select
      const promisedQuery = util.promisify(connectionProxy.query)
      for (let i = 0; i < iterations; ++i) {
        const res = await promisedQuery(s, p)
        assert.deepStrictEqual(res, expected)
      }
      testDone()
    } catch (e) {
      assert.ifError(e)
    }
  }

  test('pool: test asselect on proc', testDone => {
    usePoolCallProc(t28, 5, testDone)
  })

  test('connection: test asselect on proc', testDone => {
    t28(theConnection, 1, testDone)
  })

  test('test asselect on proc', testDone => {
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

    const fns = [
      asyncDone => {
        procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get(spName, proc => {
          const meta = proc.getMeta()
          // use an mssql style select
          const s = meta.select
          theConnection.query(s, [10, 5], (err, results) => {
            assert.ifError(err)
            const expected = [{
              num3: 15,
              ___return___: 99
            }]
            assert.deepStrictEqual(results, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('call proc in non-dbo schema with parameters using callproc syntax', testDone => {
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
        theConnection.query(createSchemaSql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.callproc(spName, [20, 8], function (err, results, output) {
          assert.ifError(err)
          const expected = [99, 28]
          assert.ok(expected[0] === output[0], "results didn't match")
          assert.ok(expected[1] === output[1], "results didn't match")
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('call proc that waits for delay of input param - wait 2, timeout 5 - should not error', testDone => {
    const spName = 'test_spwait_for'

    const fns = [
      asyncDone => {
        procedureHelper.createProcedure(spName, waitProcDef, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.setTimeout(5)
        pm.callproc(spName, ['0:0:2'], err => {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })
})
