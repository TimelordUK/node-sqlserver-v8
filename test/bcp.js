'use strict'
/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
chai.use(require('chai-as-promised'))
describe('bcp', function () {
  this.timeout(100000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('bcp employee', async function handler () {
    const employee = env.employee
    const table = await employee.create()
    const records = employee.make(200)
    const res = await employee.insertSelect(table, records)
    assert.deepStrictEqual(res, records)
  })

  it('bcp 7 column mixed table ', async function handler () {
    function getNumeric (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const bcp = env.bcpEntry({
      tableName: 'test_table_7_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'VARCHAR (255) NULL'
        },
        {
          name: 's2',
          type: 'VARCHAR (100) NULL'
        },
        {
          name: 'i1',
          type: 'int null'
        },
        {
          name: 'i2',
          type: 'int NULL'
        },
        {
          name: 'n1',
          type: 'numeric(18,6) NULL'
        },
        {
          name: 'n2',
          type: 'numeric(18,6) NULL'
        }]
    }, i => {
      return {
        id: i,
        s1: i % 2 === 0 ? null : `column1${i}`,
        s2: `testing${i + 1}2Data`,
        i1: i * 5,
        i2: i * 9,
        n1: getNumeric(i),
        n2: getNumeric(i)
      }
    }, (actual, expected) => {
      assert.deepStrictEqual(actual.length, expected.length)
      for (let i = 0; i < actual.length; ++i) {
        const lhs = actual[i]
        const rhs = expected[i]
        assert.deepStrictEqual(lhs.id, rhs.id)
        assert.deepStrictEqual(lhs.s1, rhs.s1)
        assert.deepStrictEqual(lhs.s2, rhs.s2)
        assert.deepStrictEqual(lhs.i1, rhs.i1)
        assert.deepStrictEqual(lhs.i2, rhs.i2)
        assert(Math.abs(lhs.n1 - rhs.n1) < 1e-5)
        assert(Math.abs(lhs.n2 - rhs.n2) < 1e-5)
      }
    })
    return await bcp.runner(1000)
  })

  it('bcp expect error null in non null column', async function handler () {
    const rows = 10
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'smallint not NULL'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 2 === 0 ? Math.pow(2, 10) + i : null
      }
    })
    await expect(bcp.runner(rows)).to.be.rejectedWith('Cannot insert the value NULL into column')
  })
  /*
''[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]Cannot insert the value NULL into column 'n1', table 'node.dbo.test_table_bcp'; column does not allow nulls. INSERT fails.''
    */

  it('bcp expect error duplicate primary key', async function handler () {
    const rows = 10
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'smallint'
        }]
    }, i => {
      return {
        id: i % 5,
        n1: i % 2 === 0 ? Math.pow(2, 10) + i : -Math.pow(2, 10) - i
      }
    })
    await expect(bcp.runner(rows)).to.be.rejectedWith('Violation of PRIMARY KEY constraint')
    /*
'[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]Violation of PRIMARY KEY constraint 'PK__test_tab__3213E83F11822873'. Cannot insert duplicate key in object 'dbo.test_table_bcp'. The duplicate key value is (0).'
    */
  })

  it('bcp recovery from error.', async function handler () {
    const rows = 10
    const name = 'test_table_bcp'

    const bcp = env.bcpEntry({
      tableName: name,
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'smallint'
        }]
    }, i => {
      return {
        id: i % 5,
        n1: i % 2 === 0 ? Math.pow(2, 10) + i : -Math.pow(2, 10) - i
      }
    })

    /*
'[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]Violation of PRIMARY KEY constraint 'PK__test_tab__3213E83F11822873'. Cannot insert duplicate key in object 'dbo.test_table_bcp'. The duplicate key value is (0).'
    */

    await expect(bcp.runner(rows)).to.be.rejectedWith('Violation of PRIMARY KEY constraint')
    const res = await env.theConnection.promises.query(`select count(*) as count from ${name}`)
    assert.deepStrictEqual(res.first[0].count, 0)
  })

  it('bcp hierarchyid binary', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'hierarchyid'
        }]
    }, i => {
      return {
        id: i,
        b1: i % 2 === 0 ? Buffer.from('5AE178', 'hex') : Buffer.from('58', 'hex')
      }
    })
    return await bcp.runner()
  })

  it('bcp small binary', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'varbinary(10)'
        }]
    }, i => {
      return {
        id: i,
        b1: i % 2 === 0 ?
          Buffer.from('5AE178', 'hex') :
          Buffer.from('', 'hex')
      }
    })
    return await bcp.runner()
  })

  it('bcp bit bit', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'bit'
        },
        {
          name: 'b2',
          type: 'bit'
        }]
    }, i => {
      return {
        id: i,
        b1: i % 2 === 0,
        b2: i % 3 === 0
      }
    })
    return await bcp.runner()
  })

  //  min: 'F01251E5-96A3-448D-981E-0F99D789110D',
  //  max: '45E8F437-670D-4409-93CB-F9424A40D6EE',

  it('bcp uniqueidentifier', async function handler () {
    const rows = 2000
    const g1 = 'F01251E5-96A3-448D-981E-0F99D789110D'
    const g2 = '45E8F437-670D-4409-93CB-F9424A40D6EE'
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'uniqueidentifier'
        }]
    }, i => {
      return {
        id: i,
        s1: i % 2 === 0 ? g1 : g2
      }
    })
    return await bcp.runner(rows)
  })

  it('bcp smallint', async function handler () {
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'smallint'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 2 === 0 ? Math.pow(2, 10) + i : -Math.pow(2, 10) - i
      }
    })
    return await bcp.runner(rows)
  })

  it('bcp tinyint', async function handler () {
    const rows = 2000
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'tinyint'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 255
      }
    })
    return await bcp.runner(rows)
  })

  function realCompare (actual, expected) {
    expect(actual.length).to.equal(expected.length)
    for (let i = 0; i < actual.length; ++i) {
      const lhs = actual[i]
      const rhs = expected[i]
      expect(lhs.id).to.equal(rhs.id)
      assert(Math.abs(lhs.r1 - rhs.r1) < 1e-5)
    }
  }

  it('bcp real with null', async function handler () {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'r1',
          type: 'real'
        }]
    }, i => {
      return {
        id: i,
        r1: i % 2 === 0 ? null : get(i) * 2
      }
    }, realCompare
    )
    return await bcp.runner(rows)
  })

  it('bcp real', async function handler () {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'r1',
          type: 'real'
        }]
    }, i => {
      return {
        id: i,
        r1: i % 2 === 0 ? get(i) : get(i) * 2
      }
    }, realCompare)
    return await bcp.runner(rows)
  })

  it('bcp bigint with nulls', async function handler () {
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'bigint'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 2 === 0 ? null : Math.pow(2, 40) - i
      }
    })
    return await bcp.runner(rows)
  })

  it('bcp bigint', async function handler () {
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'bigint'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 2 === 0 ? Math.pow(2, 40) + i : Math.pow(2, 40) - i
      }
    })
    return await bcp.runner(rows)
  })

  it('bcp time', async function handler () {
    const timeHelper = env.timeHelper
    const testDate = timeHelper.parseTime('16:47:04')
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 't1',
          type: 'time'
        }]
    }, i => {
      return {
        id: i,
        t1: testDate
      }
    }, (actual, expected) => {
      assert.deepStrictEqual(actual.length, expected.length)
      actual.forEach(a => {
        a.t1 = timeHelper.getUTCTime(a.t1)
      })
      expected.forEach(a => {
        a.t1 = timeHelper.getUTCTime(a.t1)
        return a
      })
      assert.deepStrictEqual(actual, expected)
    })
    return await bcp.runner(rows)
  })

  function numberCompare (actual, expected) {
    expect(actual.length).to.equal(expected.length)
    for (let i = 0; i < actual.length; ++i) {
      const lhs = actual[i]
      const rhs = expected[i]
      expect(lhs.id).to.equal(rhs.id)
      expect(lhs.n1).to.approximately(rhs.n1, 1e-5)
    }
  }

  it('bcp numeric', async function handler () {
    function get (i) {
      const v = Math.sqrt(i + 1)
      return Math.round(v * 1e6) / 1e6
    }
    const rows = 2000

    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'n1',
          type: 'numeric(18,6)'
        }]
    }, i => {
      return {
        id: i,
        n1: i % 2 === 0 ? get(i) : get(i) * 16
      }
    }, numberCompare)
    return await bcp.runner(rows)
  })

  function timeFactory (testDate, i) {
    return {
      id: i,
      d1: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
      d2: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
    }
  }

  it('bcp varchar(max) (10k chars)', async function handler () {
    const rows = 150
    const length = 10 * 1000

    const b = env.repeat('z', length)
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'VARCHAR (max) NULL'
        }]
    }, i => {
      return {
        id: i,
        s1: `${b}`
      }
    })
    return await bcp.runner(rows)
  })

  function dateTimeCompare (actual, expected) {
    expect(actual.length).to.equal(expected.length)
    for (let i = 0; i < actual.length; ++i) {
      const lhs = actual[i]
      const rhs = expected[i]
      expect(lhs.id).to.equal(rhs.id)
      if (rhs.d1) {
        delete lhs.d1.nanosecondsDelta
        expect(lhs.d1).to.deep.equal(rhs.d1)
      }
      if (rhs.d2) {
        delete lhs.d2.nanosecondsDelta
        expect(lhs.d2).to.deep.equal(rhs.d2)
      }
    }
  }

  it('bcp datetimeoffset datetimeoffset - mix with nulls', async function handler () {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'd1',
          type: 'datetimeoffset'
        },
        {
          name: 'd2',
          type: 'datetimeoffset'
        }]
    }, i => timeFactory(testDate, i)
    , dateTimeCompare)
    return await bcp.runner()
  })

  it('bcp datetimeoffset datetimeoffset', async function handler () {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'd1',
          type: 'datetimeoffset'
        },
        {
          name: 'd2',
          type: 'datetimeoffset'
        }]
    }, i => {
      return {
        id: i,
        d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
        d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
      }
    }, dateTimeCompare)
    return await bcp.runner()
  })

  it('bcp binary binary - mix with nulls', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'varbinary(10)'
        },
        {
          name: 'b2',
          type: 'varbinary(10)'
        }]
    }, i => {
      return {
        id: i,
        b1: i % 2 === 0 ? null : Buffer.from('0102030405060708090a', 'hex'),
        b2: i % 3 === 0 ? null : Buffer.from('0102030405060708090a', 'hex')
      }
    })
    return await bcp.runner()
  })

  it('bcp binary binary', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'varbinary(10)'
        },
        {
          name: 'b2',
          type: 'varbinary(10)'
        }]
    }, i => {
      return {
        id: i,
        b1: Buffer.from('0102030405060708090a', 'hex'),
        b2: Buffer.from('0102030405060708090a', 'hex')
      }
    })
    return await bcp.runner()
  })

  it('bcp bit bit - mix with nulls', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'b1',
          type: 'bit'
        },
        {
          name: 'b2',
          type: 'bit'
        }]
    }, i => {
      return {
        id: i,
        b1: i % 2 === 0 ? null : i % 3 === 0,
        b2: i % 3 === 0 ? null : i % 5 === 0
      }
    })
    return await bcp.runner()
  })

  it('bcp timestamp timestamp - mix with nulls', async function handler () {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'd1',
          type: 'datetime'
        },
        {
          name: 'd2',
          type: 'datetime'
        }]
    }, i => timeFactory(testDate, i)
    , dateTimeCompare)
    return await bcp.runner()
  })

  it('bcp timestamp timestamp - no null', async function handler () {
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'd1',
          type: 'datetime'
        },
        {
          name: 'd2',
          type: 'datetime'
        }]
    }, i => {
      return {
        id: i,
        d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
        d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
      }
    }, dateTimeCompare)
    return await bcp.runner()
  })

  it('bcp varchar varchar with nulls', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'VARCHAR (255) NULL'
        },
        {
          name: 's2',
          type: 'VARCHAR (100) NULL'
        }]
    }, i => {
      return {
        id: i,
        s1: i % 2 === 0 ? null : `column1${i}`,
        s2: `testing${i + 1}2Data`
      }
    })
    return await bcp.runner()
  })

  it('bcp varchar varchar', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'VARCHAR (255)'
        },
        {
          name: 's2',
          type: 'VARCHAR (100)'
        }]
    }, i => {
      return {
        id: i,
        s1: i % 2 === 0 ? null : `column1${i}`,
        s2: `testing${i + 1}2Data`
      }
    })
    return await bcp.runner()
  })

  it('bcp int, int column - with nulls', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'val',
          type: 'INT'
        }
      ]
    }, i => {
      return {
        id: i,
        val: i % 2 === 0 ? null : i * 2
      }
    })
    return await bcp.runner()
  })

  it('bcp int, int column', async function handler () {
    const bcp = env.bcpEntry({
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'val',
          type: 'INT'
        }
      ]
    }, i => {
      return {
        id: i,
        val: i * 2
      }
    })
    return await bcp.runner()
  })
})
