// ---------------------------------------------------------------------------------------------------------------------------------
// File: dates.js
// Contents: test suite for queries and parameters dealing with dates
//
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ---------------------------------------------------------------------------------------------------------------------------------

/* globals describe it */

const path = require('path')
const util = require('util')
const assert = require('assert')
const { TestEnv } = require(path.join(__dirname, './env/test-env'))
const env = new TestEnv()

describe('dates', function () {
  this.timeout(10000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  class DateTableTest {
    constructor (c, def) {
      const tableName = def.tableName
      const columns = def.columns.map(e => `${e.name} ${e.type}`).join(', ')
      const columnNames = def.columns.map(e => `${e.name}`).join(', ')
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
      const createTableSql = `CREATE TABLE ${tableName} (id int identity, ${columns})`
      const clusteredSql = `CREATE CLUSTERED INDEX IX_${tableName} ON ${tableName}(id)`
      const insertSql = `INSERT INTO ${tableName} (${columnNames}) VALUES `
      const selectSql = `SELECT ${columnNames} FROM ${tableName} ORDER BY id`
      const trucateSql = `TRUNCATE TABLE ${tableName}`

      this.definition = def
      this.theConnection = c
      this.dropTableSql = dropTableSql
      this.createTableSql = createTableSql
      this.clusteredSql = clusteredSql
      this.selectSql = selectSql
      this.insertSql = insertSql
      this.truncateSql = trucateSql
      this.tableName = def.tableName
    }

    async create () {
      const promisedRaw = util.promisify(this.env.theConnection.queryRaw)
      await promisedRaw(this.dropTableSql)
      await promisedRaw(this.createTableSql)
      await promisedRaw(this.clusteredSql)
    }
  }

  class InsertSqlHelper {
    constructor (tt) {
      const randomHour = Math.floor(Math.random() * 24)
      const randomMinute = Math.floor(Math.random() * 60)
      const randomSecond = Math.floor(Math.random() * 60)
      let randomMs = []
      const nanoseconds = [1e-9 * 100, 0.9999999, 0.5]
      const nanosecondsDeltaExpected = [1e-7, 0.0009999, 0]
      let insertHoursQuery = [tt.insertSql]
      for (let h = 0; h <= 23; ++h) {
        insertHoursQuery.push(['(\'', h, ':00:00.00\'),'].join(''))
      }
      insertHoursQuery = insertHoursQuery.join('')
      insertHoursQuery = insertHoursQuery.substr(0, insertHoursQuery.length - 1)
      insertHoursQuery += ';'

      let insertMinutesSql = [tt.insertSql]
      for (let m = 0; m <= 59; ++m) {
        insertMinutesSql.push(['(\'', randomHour, ':', m, ':00.00\'),'].join(''))
      }
      insertMinutesSql = insertMinutesSql.join('')
      insertMinutesSql = insertMinutesSql.substr(0, insertMinutesSql.length - 1)
      insertMinutesSql += ';'

      let insertSecondsSql = [tt.insertSql]
      for (let s = 0; s <= 59; ++s) {
        insertSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', s, '.00\'),'].join(''))
      }
      insertSecondsSql = insertSecondsSql.join('')
      insertSecondsSql = insertSecondsSql.substr(0, insertSecondsSql.length - 1)
      insertSecondsSql += ';'

      let insertMilliSecondsSql = [tt.insertSql]
      randomMs = []

      for (let ms = 0; ms <= 50; ++ms) {
        randomMs.push(Math.floor(Math.random() * 1000))
        insertMilliSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', randomSecond, (randomMs[ms] / 1000).toFixed(3).substr(1), '\'),'].join(''))
      }
      insertMilliSecondsSql = insertMilliSecondsSql.join('')
      insertMilliSecondsSql = insertMilliSecondsSql.substr(0, insertMilliSecondsSql.length - 1)
      insertMilliSecondsSql += ';'

      let insertNanoSecondsSql = [tt.insertSql]
      for (const i in nanoseconds) {
        insertNanoSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', randomSecond, (nanoseconds[i]).toFixed(7).substr(1), '\'),'].join(''))
      }
      insertNanoSecondsSql = insertNanoSecondsSql.join('')
      insertNanoSecondsSql = insertNanoSecondsSql.substr(0, insertNanoSecondsSql.length - 1)
      insertNanoSecondsSql += ';'

      this.randomHour = randomHour
      this.randomMinute = randomMinute
      this.randomSecond = randomSecond
      this.nanoseconds = nanoseconds
      this.randomMs = randomMs
      this.insertHoursQuery = insertHoursQuery
      this.insertMinutesSql = insertMinutesSql
      this.insertSecondsSql = insertSecondsSql
      this.insertMilliSecondsSql = insertMilliSecondsSql
      this.insertNanoSecondsSql = insertNanoSecondsSql
      this.nanosecondsDeltaExpected = nanosecondsDeltaExpected
    }
  }

  it('time to millisecond components', testDone => {
    const tableDef = {
      tableName: 'time_test',
      columns: [
        {
          name: 'test_time',
          type: 'time'
        }
      ]
    }
    const promisedRaw = util.promisify(env.theConnection.queryRaw)
    const tt = new DateTableTest(env.theConnection, tableDef)
    const ih = new InsertSqlHelper(tt)

    const fns =
      [
        async asyncDone => {
          try {
            await tt.create()
            await promisedRaw(ih.insertHoursQuery)
            asyncDone()
          } catch (e) {
            assert(e)
            testDone()
          }
        },
        asyncDone => {
          let expectedHour = -1
          const stmt = env.theConnection.queryRaw(tt.selectSql)
          stmt.on('error', e => {
            assert.ifError(e)
          })
          stmt.on('column', (c, d, more) => {
            ++expectedHour
            assert(c === 0)
            assert(!more)
            const expectedDate = new Date(Date.UTC(1900, 0, 1, expectedHour, 0, 0, 0))
            expectedDate.nanosecondsDelta = 0
            assert.deepStrictEqual(d, expectedDate)
          })
          stmt.on('done', () => {
            assert(expectedHour === 23)
            asyncDone()
          })
        },
        asyncDone => {
          env.theConnection.queryRaw(tt.truncateSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        asyncDone => {
        // insert all the mins and make sure they come back from time column
          env.theConnection.queryRaw(ih.insertMinutesSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        asyncDone => {
          let expectedMinute = -1

          const stmt = env.theConnection.queryRaw(tt.selectSql)

          stmt.on('error', e => {
            assert.ifError(e)
          })
          stmt.on('column', (c, d, more) => {
            ++expectedMinute
            assert(c === 0)
            assert(!more)
            const expectedDate = new Date(Date.UTC(1900, 0, 1, ih.randomHour, expectedMinute, 0, 0))
            expectedDate.nanosecondsDelta = 0
            assert.deepStrictEqual(d, expectedDate)
          })
          stmt.on('done', () => {
            assert(expectedMinute === 59)
            asyncDone()
          })
        },
        asyncDone => {
          env.theConnection.queryRaw(tt.truncateSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        // insert all the seconds and make sure they come back from time column
        asyncDone => {
          env.theConnection.queryRaw(ih.insertSecondsSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        asyncDone => {
          let expectedSecond = -1
          const stmt = env.theConnection.queryRaw(tt.selectSql)

          stmt.on('error', e => {
            assert.ifError(e)
          })
          stmt.on('column', (c, d, more) => {
            ++expectedSecond
            assert(c === 0)
            assert(!more)
            const expectedDate = new Date(Date.UTC(1900, 0, 1, ih.randomHour, ih.randomMinute, expectedSecond, 0))
            expectedDate.nanosecondsDelta = 0
            assert.deepStrictEqual(d, expectedDate)
          })
          stmt.on('done', () => {
            assert(expectedSecond === 59)
            asyncDone()
          })
        },
        asyncDone => {
          env.theConnection.queryRaw(tt.truncateSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        // insert a sampling of milliseconds and make sure they come back correctly
        asyncDone => {
          env.theConnection.queryRaw(ih.insertMilliSecondsSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        asyncDone => {
          let msCount = -1

          const stmt = env.theConnection.queryRaw(tt.selectSql)

          stmt.on('error', e => {
            assert.ifError(e)
          })

          stmt.on('column', (c, d, more) => {
            ++msCount
            assert(c === 0)
            assert(!more)
            const expectedDate = new Date(Date.UTC(1900, 0, 1, ih.randomHour, ih.randomMinute, ih.randomSecond, ih.randomMs[msCount]))
            expectedDate.nanosecondsDelta = 0
            assert.deepStrictEqual(d, expectedDate, 'Milliseconds didn\'t match')
          })

          stmt.on('done', () => {
            assert(msCount === 50)
            asyncDone()
          })
        },
        asyncDone => {
          env.theConnection.queryRaw(tt.truncateSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        // insert a sampling of ns and make sure they come back correctly
        asyncDone => {
          env.theConnection.queryRaw(ih.insertNanoSecondsSql, e => {
            assert.ifError(e)
            asyncDone()
          })
        },
        asyncDone => {
          let nsCount = -1
          const stmt = env.theConnection.queryRaw(tt.selectSql)

          stmt.on('error', e => {
            assert.ifError(e)
          })
          stmt.on('column', (c, d, more) => {
            ++nsCount
            assert(c === 0)
            assert(!more)
            const expectedDate = new Date(Date.UTC(1900, 0, 1, ih.randomHour, ih.randomMinute, ih.randomSecond, ih.nanoseconds[nsCount] * 1000))
            expectedDate.nanosecondsDelta = ih.nanosecondsDeltaExpected[nsCount]
            assert.deepStrictEqual(d, expectedDate, 'Nanoseconds didn\'t match')
          })
          stmt.on('done', () => {
            assert(nsCount === 2)
            asyncDone()
          })
        }
      ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  // this test simply verifies dates round trip.  It doesn't try to verify illegal dates vs. legal dates.
  // SQL Server is assumed to be only returning valid times and dates.

  it('date retrieval verification', testDone => {
    const testDates = ['1-1-1970', '12-31-1969', '2-29-1904', '2-29-2000']
    const tableDef = {
      tableName: 'date_test',
      columns: [
        {
          name: 'test_date',
          type: 'date'
        }
      ]
    }
    const promisedRaw = util.promisify(env.theConnection.queryRaw)
    const tt = new DateTableTest(env.theConnection, tableDef)

    // 'INSERT INTO date_test (test_date) VALUES ('1-1-1970'),('12-31-1969'),('2-29-1904'),('2-29-2000');

    const insertDatesQuery = `${tt.insertSql} ${testDates.map(d => `('${d}')`)}`

    const expectedDates = []
    for (const testDate of testDates) {
      const d = new Date(testDate)
      // eslint-disable-next-line camelcase
      const now_utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
      const expectedDate = new Date(now_utc)
      expectedDates.push([expectedDate])
    }
    const expectedResults = {
      meta: [{ name: 'test_date', size: 10, nullable: true, type: 'date', sqlType: 'date' }],
      rows: expectedDates
    }

    const fns = [
      async asyncDone => {
        try {
          await tt.create()
          await promisedRaw(insertDatesQuery)
          asyncDone()
        } catch (e) {
          assert(e)
          testDone()
        }
      },
      // test valid dates
      async asyncDone => {
        env.theConnection.setUseUTC(false)
        try {
          const r = await promisedRaw(tt.selectSql)
          assert.deepStrictEqual(expectedResults.meta, r.meta)
          for (const row in r.rows) {
            for (const d in row) {
              assert.deepStrictEqual(expectedResults.rows[row][d], r.rows[row][d])
            }
          }
          asyncDone()
        } catch (e) {
          assert(e)
          testDone()
        }
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('test timezone offset correctly offsets js date type', testDone => {
    env.theConnection.query('select convert(datetimeoffset(7), \'2014-02-14 22:59:59.9999999 +05:00\') as dto1, convert(datetimeoffset(7), \'2014-02-14 17:59:59.9999999 +00:00\') as dto2',
      function (err, res) {
        assert.ifError(err)
        const dto1 = res.dto1
        const dto2 = res.dto2
        assert(dto1 === dto2)
        testDone()
      })
  })

  // this test simply verifies dates round trip.  It doesn't try to verify illegal dates vs. legal dates.
  // SQL Server is assumed to be only returning valid times and dates.

  it('date to millisecond verification', testDone => {
    const testDates = [{ date1: '1-1-1900', date2: '1-1-1901', milliseconds: 31536000000 },
      { date1: '2-28-1900', date2: '3-1-1900', milliseconds: 86400000 },
      { date1: '2-28-1904', date2: '3-1-1904', milliseconds: 172800000 },
      { date1: '2-28-2000', date2: '3-1-2000', milliseconds: 172800000 },
      { date1: '1-1-1970', date2: '12-31-1969', milliseconds: -86400000 },
      { date1: '1-1-1969', date2: '1-1-1968', milliseconds: -(31536000000 + 86400000) },
      { date1: '2-3-4567', date2: '2-3-4567', milliseconds: 0 }]

    const tableDef = {
      tableName: 'date_diff_test',
      columns: [
        {
          name: 'date1',
          type: 'datetime2'
        },
        {
          name: 'date2',
          type: 'datetime2'
        }
      ]
    }

    const tt = new DateTableTest(env.theConnection, tableDef)
    const insertDatesQuery = `${tt.insertSql} ${testDates.map(d => `('${d.date1}', '${d.date2}')`)}`

    const promisedRaw = util.promisify(env.theConnection.queryRaw)
    const fns = [
      async asyncDone => {
        try {
          await tt.create()
          await promisedRaw(insertDatesQuery)
          asyncDone()
        } catch (e) {
          assert(e)
          testDone()
        }
      },

      // test valid dates
      async asyncDone => {
        try {
          const r = await promisedRaw(tt.selectSql)
          for (const d in r.rows) {
            const timeDiff = r.rows[d][1].getTime() - r.rows[d][0].getTime()
            assert(timeDiff === testDates[d].milliseconds)
          }
          asyncDone()
        } catch (e) {
          assert(e)
          testDone()
        }
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('test timezone components of datetimeoffset', testDone => {
    const tzYear = 1970
    const tzMonth = 0
    const tzDay = 1
    const tzHour = 0
    const tzMinute = 0
    const tzSecond = 0

    const insertedDate = new Date(Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzSecond))
    const msPerHour = 1000 * 60 * 60

    const tableDef = {
      tableName: 'datetimeoffset_test',
      columns: [
        {
          name: 'test_datetimeoffset',
          type: 'datetimeoffset'
        }
      ]
    }

    const tt = new DateTableTest(env.theConnection, tableDef)

    // there are some timezones not on hour boundaries, but we aren't testing those in these unit tests
    // INSERT INTO datetimeoffset_test (test_datetimeoffset) VALUES ('1970-1-1 0:0:0-12:00'),('1970-1-1 0:0:0-11:00'),

    const offsets = []
    for (let offset = -12; offset <= 12; ++offset) {
      offsets.push(offset)
    }

    function get (tz) {
      const paddedYear = tzYear < 1000 ? '0' + tzYear : tzYear
      const sign = (tz < 0) ? '' : '+'
      const x = `${paddedYear}-${tzMonth + 1}-${tzDay} ${tzHour}:${tzMinute}:${tzSecond}${sign}${tz}:00`
      return x
    }

    const insertDatesQuery = `${tt.insertSql} ${offsets.map(t => `('${get(t)}')`)}`

    const promisedRaw = util.promisify(env.theConnection.queryRaw)
    const fns = [
      async asyncDone => {
        try {
          await tt.create()
          await promisedRaw(insertDatesQuery)
          asyncDone()
        } catch (e) {
          assert(e)
          testDone()
        }
      },
      asyncDone => {
        const stmt = env.theConnection.queryRaw(tt.selectSql)
        let tz = -13

        stmt.on('error', e => {
          assert.ifError(e)
        })
        stmt.on('column', function (c, d, m) {
          assert(c === 0, 'c != 0')
          assert(!m, 'm != false')
          assert(d.nanosecondsDelta === 0, 'nanosecondsDelta != 0')
          ++tz
          const expectedDate = new Date(insertedDate.valueOf() - (msPerHour * tz))
          assert(d.valueOf() === expectedDate.valueOf(), 'Dates don\'t match')
        })
        stmt.on('done', () => {
          assert(tz === 12, 'Incorrect final timezone')
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })
})
