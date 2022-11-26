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

const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('dates', function () {
  this.timeout(60000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  class InsertSqlHelper {
    constructor (tt) {
      const randomHour = Math.floor(Math.random() * 24)
      const randomMinute = Math.floor(Math.random() * 60)
      const randomSecond = Math.floor(Math.random() * 60)
      const nanoseconds = [1e-9 * 100, 0.9999999, 0.5]
      const nanosecondsDeltaExpected = [1e-7, 0.0009999, 0]
      let insertHoursQuery = [tt.insertSql]
      for (let h = 0; h <= 23; ++h) {
        insertHoursQuery.push(['(\'', h, ':00:00.00\'),'].join(''))
      }
      insertHoursQuery = insertHoursQuery.join('')
      insertHoursQuery = insertHoursQuery.substring(0, insertHoursQuery.length - 1)
      insertHoursQuery += ';'

      let insertMinutesSql = [tt.insertSql]
      for (let m = 0; m <= 59; ++m) {
        insertMinutesSql.push(['(\'', randomHour, ':', m, ':00.00\'),'].join(''))
      }
      insertMinutesSql = insertMinutesSql.join('')
      insertMinutesSql = insertMinutesSql.substring(0, insertMinutesSql.length - 1)
      insertMinutesSql += ';'

      let insertSecondsSql = [tt.insertSql]
      for (let s = 0; s <= 59; ++s) {
        insertSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', s, '.00\'),'].join(''))
      }
      insertSecondsSql = insertSecondsSql.join('')
      insertSecondsSql = insertSecondsSql
        .substring(0, insertSecondsSql.length - 1)
      insertSecondsSql += ';'

      let insertMilliSecondsSql = [tt.insertSql]
      const randomMs = []

      for (let ms = 0; ms <= 50; ++ms) {
        randomMs.push(Math.floor(Math.random() * 1000))
        insertMilliSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', randomSecond, (randomMs[ms] / 1000)
          .toFixed(3)
          .substring(1), '\'),']
          .join(''))
      }
      insertMilliSecondsSql = insertMilliSecondsSql.join('')
      insertMilliSecondsSql = insertMilliSecondsSql
        .substring(0, insertMilliSecondsSql.length - 1)
      insertMilliSecondsSql += ';'

      let insertNanoSecondsSql = [tt.insertSql]
      for (const i in nanoseconds) {
        insertNanoSecondsSql.push(['(\'', randomHour, ':', randomMinute, ':', randomSecond, (nanoseconds[i])
          .toFixed(7)
          .substring(1), '\'),'].join(''))
      }
      insertNanoSecondsSql = insertNanoSecondsSql.join('')
      insertNanoSecondsSql = insertNanoSecondsSql
        .substring(0, insertNanoSecondsSql.length - 1)
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

  it('time to millisecond components', async function handler () {
    const tableDef = {
      tableName: 'time_test',
      columns: [
        {
          name: 'test_time',
          type: 'time'
        }
      ]
    }
    const promises = env.theConnection.promises
    const tt = env.bulkTableTest(tableDef)
    await tt.create()
    const ih = new InsertSqlHelper(tt)

    async function hours () {
      await promises.query(tt.truncateSql)
      await promises.query(ih.insertHoursQuery)
      const expectedHour = 0
      const results = await promises.query(tt.selectSql, [], { raw: true })
      const expectedDate1 = env.timeHelper.makeUTCJan1900HH(expectedHour)
      expectedDate1.nanosecondsDelta = 0
      expect(results.first[0][0]).to.deep.equal(expectedDate1)
    }

    async function minutes () {
      let expectedMinute = 0
      await promises.query(tt.truncateSql)
      await promises.query(ih.insertMinutesSql)
      const results = await promises.query(tt.selectSql, [], { raw: true })
      results.first.forEach(r => {
        const expectedDate = env.timeHelper.makeUTCJan1900HHMM(ih.randomHour, expectedMinute)
        expectedDate.nanosecondsDelta = 0
        expect(r[0]).to.deep.equal(expectedDate)
        ++expectedMinute
      })
      expect(expectedMinute).to.equal(60)
    }

    async function seconds () {
      let expectedSecond = 0
      await promises.query(tt.truncateSql)
      await promises.query(ih.insertSecondsSql)
      const results = await promises.query(tt.selectSql, [], { raw: true })
      results.first.forEach(r => {
        const expectedDate = env.timeHelper.makeUTCJan1900HHMMSS(ih.randomHour, ih.randomMinute, expectedSecond)
        expectedDate.nanosecondsDelta = 0
        expect(r[0]).to.deep.equal(expectedDate)
        ++expectedSecond
      })
      expect(expectedSecond).to.equal(60)
    }

    async function milliSeconds () {
      await promises.query(tt.truncateSql)
      await promises.query(ih.insertMilliSecondsSql)
      let msCount = 0
      const results = await promises.query(tt.selectSql, [], { raw: true })
      results.first.forEach(r => {
        const expectedDate = env.timeHelper.makeUTCJan1900HHMMSSMS(ih.randomHour, ih.randomMinute, ih.randomSecond, ih.randomMs[msCount])
        expectedDate.nanosecondsDelta = 0
        expect(r[0]).to.deep.equal(expectedDate)
        ++msCount
      })
      expect(msCount).to.equal(51)
    }

    async function nanoSeconds () {
      await promises.query(tt.truncateSql)
      await promises.query(ih.insertNanoSecondsSql)
      let nsCount = 0
      const results = await promises.query(tt.selectSql, [], { raw: true })
      results.first.forEach(r => {
        const expectedDate = env.timeHelper.makeUTCJan1900HHMMSSMS(ih.randomHour, ih.randomMinute, ih.randomSecond, ih.nanoseconds[nsCount] * 1000)
        expectedDate.nanosecondsDelta = ih.nanosecondsDeltaExpected[nsCount]
        expect(r[0]).to.deep.equal(expectedDate)
        ++nsCount
      })
      assert(nsCount === 3)
    }

    await milliSeconds()
    await hours()
    await minutes()
    await seconds()
    await milliSeconds()
    await nanoSeconds()
  })

  // this test simply verifies dates round trip.  It doesn't try to verify illegal dates vs. legal dates.
  // SQL Server is assumed to be only returning valid times and dates.

  it('date retrieval verification', async function handler () {
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
    const tt = env.bulkTableTest(tableDef)

    // 'INSERT INTO date_test (test_date) VALUES ('1-1-1970'),('12-31-1969'),('2-29-1904'),('2-29-2000');

    const insertDatesQuery = `${tt.insertSql} ${testDates.map(d => `('${d}')`)}`

    const expectedDates = testDates.map(testDate => [env.timeHelper.getUTCDateTime(new Date(testDate))])

    const expectedResults = {
      meta: [{ name: 'test_date', size: 10, nullable: true, type: 'date', sqlType: 'date' }],
      rows: expectedDates
    }

    const promises = env.theConnection.promises
    await tt.create()
    await promises.query(insertDatesQuery)
    env.theConnection.setUseUTC(false)
    const r = await promises.query(tt.selectSql, [], { raw: true })
    assert.deepStrictEqual(r.meta[0], expectedResults.meta)
    assert.deepStrictEqual(r.first, expectedResults.rows)
  })

  it('test timezone offset correctly offsets js date type', async function handler () {
    const res = await env.theConnection.promises.query(`select 
      convert(datetimeoffset(7),
      '2014-02-14 22:59:59.9999999 +05:00') as dto1,
      convert(datetimeoffset(7),
      '2014-02-14 17:59:59.9999999 +00:00') as dto2`)
    const col = res.first[0]
    delete col.dto1.nanoseconds
    delete col.dto2.nanoseconds
    expect(col.dto1).to.deep.equal(col.dto2)
  })

  // this test simply verifies dates round trip.  It doesn't try to verify illegal dates vs. legal dates.
  // SQL Server is assumed to be only returning valid times and dates.

  it('date to millisecond verification', async function handler () {
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

    const tt = env.bulkTableTest(tableDef)
    const insertDatesQuery = `${tt.insertSql} ${testDates.map(d => `('${d.date1}', '${d.date2}')`)}`
    await tt.create()
    const promises = env.theConnection.promises
    await promises.query(insertDatesQuery, [], { raw: true })
    const r = await promises.query(tt.selectSql, [], { raw: true })
    for (const d in r.first) {
      const timeDiff = r.first[d][1].getTime() - r.first[d][0].getTime()
      expect(timeDiff).to.equal(testDates[d].milliseconds)
    }
  })

  it('test timezone components of datetimeoffset', async function handler () {
    const tzYear = 1970
    const tzMonth = 0
    const tzDay = 1
    const tzHour = 0
    const tzMinute = 0
    const tzSecond = 0

    const insertedDate = env.timeHelper.makeUTCDateHHMMSS(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond)
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

    // there are some timezones not on hour boundaries, but we aren't testing those in these unit tests
    // INSERT INTO datetimeoffset_test (test_datetimeoffset) VALUES ('1970-1-1 0:0:0-12:00'),('1970-1-1 0:0:0-11:00'),

    const offsets = []
    for (let offset = -12; offset <= 12; ++offset) {
      offsets.push(offset)
    }

    function get (tz) {
      const paddedYear = tzYear < 1000 ? '0' + tzYear : tzYear
      const sign = (tz < 0) ? '' : '+'
      return `${paddedYear}-${tzMonth + 1}-${tzDay} ${tzHour}:${tzMinute}:${tzSecond}${sign}${tz}:00`
    }

    const tt = env.bulkTableTest(tableDef)
    const insertDatesQuery = `${tt.insertSql} ${offsets.map(t => `('${get(t)}')`)}`

    await tt.create()
    const promises = env.theConnection.promises
    await promises.query(insertDatesQuery, [], { raw: true })
    const r = await promises.query(tt.selectSql, [], { raw: true })
    let tz = -13

    r.first.forEach(r => {
      ++tz
      const expectedDate = new Date(insertedDate.valueOf() - (msPerHour * tz))
      expect(r[0].valueOf()).to.deep.equal(expectedDate.valueOf())
    })
    expect(tz).to.equal(12)
  })
})
