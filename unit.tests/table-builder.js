'use strict'
/* global suite teardown teardown test setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')
const Employee = require('./employee').Employee
const TimeHelper = require('./time-helper').TimeHelper

suite('table_builder', function () {
  let theConnection
  this.timeout(60000)
  let connStr
  let helper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === null || err === false)
        theConnection = newConn
        theConnection.setUseUTC(true)
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert(err === null || err === false || err === undefined)
      done()
    })
  })

  class Checker {
    constructor (builder) {
      this.builder = builder
    }

    async check (makeOne, compare) {
      const builder = this.builder
      const table = builder.toTable()
      await builder.drop()
      await builder.create()
      const vec = []
      for (let i = 0; i < 20; ++i) {
        vec.push(makeOne(i))
      }
      await table.promises.insert(vec)
      const primaryCols = builder.primaryColumns
      const keys = vec.map(elem => {
        return primaryCols.reduce(function (obj, column) {
          if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
            obj[column.name] = elem[column.name]
          }
          return obj
        }, {})
      })

      const s1 = await table.promises.select(keys)
      assert.deepStrictEqual(vec.length, s1.length)
      for (let i = 0; i < vec.length; ++i) {
        const lhs = vec[i]
        const rhs = s1[i]
        if (compare) {
          compare(lhs, rhs)
        } else {
          assert.deepStrictEqual(lhs, rhs)
        }
      }

      await builder.drop()
    }
  }

  test('use table builder to bind to a table provide no catalogue', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * 5,
        col_b: `str_${i}`,
        col_c: i + 1,
        col_d: i - 1,
        col_e: `str2_${i}`
      }
    }

    async function runLocal (adder, makeOne, checkOne) {
      const tableName = 'tmpTableBuilder'
      const mgr = theConnection.tableMgr()
      const builder = mgr.makeBuilder(tableName)
      adder(builder)
      const checker = new Checker(builder)
      await checker.check(makeOne, checkOne)
    }

    runLocal(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asInt()
      builder.addColumn('col_b').asVarChar(100)
      builder.addColumn('col_c').asInt()
      builder.addColumn('col_d').asInt()
      builder.addColumn('col_e').asVarChar(100)
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, time', testDone => {
    const th = new TimeHelper()
    function makeOne (i) {
      return {
        id: i,
        col_a: th.parseTime(`16:47:${i + 10}`)
      }
    }

    function checkOne (lhs, rhs) {
      const today = th.getUTCTime(rhs.col_a)
      rhs.col_a = today
      assert.deepStrictEqual(lhs.id, rhs.id)
      assert(Math.abs(lhs.col_a - rhs.col_a) < 1e-5)
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asTime()
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, datetimeoffset', testDone => {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')

    function makeOne (i) {
      return {
        id: i,
        col_a: new Date(testDate.getTime() + i * 60 * 60 * 1000),
        col_b: new Date(testDate.getTime() - i * 60 * 60 * 1000)
      }
    }

    function checkOne (lhs, rhs) {
      assert.deepStrictEqual(lhs.id, rhs.id)
      delete lhs.col_a.nanosecondsDelta
      delete lhs.col_b.nanosecondsDelta
      delete rhs.col_a.nanosecondsDelta
      delete rhs.col_b.nanosecondsDelta
      assert.deepStrictEqual(lhs.col_a, rhs.col_a)
      assert.deepStrictEqual(lhs.col_b, rhs.col_b)
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asDateTimeOffset()
      builder.addColumn('col_b').asDateTimeOffset()
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, nvarchar(max)', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: repeat('z', 4000)
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asNVarCharMax()
    }, makeOne).then(() => {
      testDone()
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, decimal', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * 1.0 / ((i * i) + (1 * 1.0))
      }
    }

    function checkOne (lhs, rhs) {
      assert.deepStrictEqual(lhs.id, rhs.id)
      assert(Math.abs(lhs.col_a - rhs.col_a) < 1e-5)
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asDecimal(23, 18)
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, numeric', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * 1.0 / ((i * i) + (1 * 1.0))
      }
    }

    function checkOne (lhs, rhs) {
      assert.deepStrictEqual(lhs.id, rhs.id)
      assert(Math.abs(lhs.col_a - rhs.col_a) < 1e-5)
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asNumeric(18, 6)
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, real', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * 1.0 / ((i * i) + (1 * 1.0))
      }
    }

    function checkOne (lhs, rhs) {
      assert.deepStrictEqual(lhs.id, rhs.id)
      assert(Math.abs(lhs.col_a - rhs.col_a) < 1e-5)
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asReal()
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, bigint', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * i
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asBigInt()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  /*
  [BusinessEntityID] int primary key,
  [NationalIDNumber] [nvarchar](15) NOT NULL,
  [LoginID] [nvarchar](256) NOT NULL,
  [OrganizationNode] [hierarchyid] NULL,
  [OrganizationLevel]  AS ([OrganizationNode].[GetLevel]()),
  [JobTitle] [nvarchar](50) NOT NULL,
  [BirthDate] [date] NOT NULL,
  [MaritalStatus] [nchar](1) NOT NULL,
  [Gender] [nchar](1) NOT NULL,
  [HireDate] [date] NOT NULL,
  [SalariedFlag] [bit] NOT NULL,
  [VacationHours] [smallint] NOT NULL,
  [SickLeaveHours] [smallint] NOT NULL,
  [CurrentFlag] [bit] NOT NULL,
  [rowguid] [uniqueidentifier] ROWGUIDCOL  NOT NULL,
  [ModifiedDate] [datetime] NOT NULL
  */

  test('use table builder to bind to a complex employee table', testDone => {
    // tableName, helper, connection
    const employee = new Employee('builder_employee', helper, theConnection)
    const records = employee.make(250)
    function makeOne (i) {
      return records[i % records.length]
    }

    run(builder => {
      builder.addColumn('[BusinessEntityID]').asInt().isPrimaryKey(1)
      builder.addColumn('[NationalIDNumber]').asNVarChar(15).notNull()
      builder.addColumn('[LoginID]').asNVarChar(256).notNull()
      builder.addColumn('[OrganizationNode]').asHierarchyId().null()
      builder.addColumn('[OrganizationLevel]').asInt().asExpression('AS ([OrganizationNode].[GetLevel]())')
      builder.addColumn('[JobTitle]').asNVarChar(50).notNull()
      builder.addColumn('[BirthDate]').asDate().notNull()
      builder.addColumn('[MaritalStatus]').asNChar(1).notNull()
      builder.addColumn('[Gender]').asNChar(1).notNull()
      builder.addColumn('[HireDate]').asDate().notNull()
      builder.addColumn('[SalariedFlag]').asBit().notNull()
      builder.addColumn('[VacationHours]').asSmallInt().notNull()
      builder.addColumn('[SickLeaveHours]').asSmallInt().notNull()
      builder.addColumn('[CurrentFlag]').asBit().notNull()
      builder.addColumn('[rowguid]').asUniqueIdentifier().withDecorator('ROWGUIDCOL  NOT NULL')
      builder.addColumn('[ModifiedDate]').asDateTime().notNull()
    }, makeOne).then(() => {
      testDone()
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, datetime', testDone => {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')

    function makeOne (i) {
      return {
        id: i,
        col_a: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
        col_b: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
      }
    }

    function checkOne (lhs, rhs) {
      assert.deepStrictEqual(lhs.id, rhs.id)
      if (rhs.col_a) {
        delete rhs.col_a.nanosecondsDelta
        assert.deepStrictEqual(lhs.col_a, rhs.col_a)
      }
      if (rhs.col_b) {
        delete rhs.col_b.nanosecondsDelta
        assert.deepStrictEqual(lhs.col_b, rhs.col_b)
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asDateTime()
      builder.addColumn('col_b').asDateTime()
    }, makeOne, checkOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, uniqueidentifier', testDone => {
    const g1 = 'F01251E5-96A3-448D-981E-0F99D789110D'
    const g2 = '45E8F437-670D-4409-93CB-F9424A40D6EE'
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 2 === 0 ? g1 : g2
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asUniqueIdentifier()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, varbinary', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: Buffer.from('0102030405060708090a', 'hex')
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asVarBinary(10)
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      testDone(e)
      assert(e)
    })
  })

  test('use table builder to bind to a table int, int', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 2 === 0 ? i * i : i
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asInt()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      testDone(e)
      assert(e)
    })
  })

  test('use table builder to bind to a table int, smallint', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 1000
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asSmallInt()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      testDone(e)
      assert(e)
    })
  })

  test('use table builder to bind to a table int, tinyint', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 100
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asTinyInt()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  test('use table builder to bind to a table int, bit', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 2 === 0
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asBit()
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })

  async function run (adder, makeOne, checkOne) {
    const tableName = 'tmpTableBuilder'
    const mgr = theConnection.tableMgr()
    const res = await theConnection.promises.query('SELECT db_NAME() as [db]')
    const builder = mgr.makeBuilder(tableName, res.first[0].db || 'node')

    adder(builder)

    const checker = new Checker(builder)
    await checker.check(makeOne, checkOne)
  }

  function repeat (c, num) {
    return new Array(num + 1).join(c)
  }

  test('use table builder to bind to a table int, varchar', testDone => {
    function makeOne (i) {
      return {
        id: i,
        col_a: i * 5,
        col_b: `str_${i}`,
        col_c: i + 1,
        col_d: i - 1,
        col_e: `str2_${i}`
      }
    }

    run(builder => {
      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asInt()
      builder.addColumn('col_b').asVarChar(100)
      builder.addColumn('col_c').asInt()
      builder.addColumn('col_d').asInt()
      builder.addColumn('col_e').asVarChar(100)
    }, makeOne).then((e) => {
      testDone(e)
    }).catch(e => {
      assert(e)
      testDone(e)
    })
  })
})
