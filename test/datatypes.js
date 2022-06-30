// ---------------------------------------------------------------------------------------------------------------------------------
// File: datatypes.js
// Contents: test suite for verifying the driver can use SQL Server Datatypes
//
// Copyright Microsoft Corporation
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
// ---------------------------------------------------------------------------------------------------------------------------------`

/* globals describe it */
const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('datatypes', function () {
  const tablename = 'types_table'
  const testname = 'not set yet'
  const driver = 'SQL Server Native Client 11.0'

  this.timeout(20000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('write / read an image column', async function handler () {
    const testcolumntype = ' Image'
    const testcolumnname = 'col1'

    await env.commonTestFnPromises.create(env.theConnection, tablename, testcolumnname, testcolumntype)
    const binaryBuffer = await env.readAsBinary('SampleJPGImage_50kbmb.jpg')
    const insertSql = `insert into ${tablename} (${testcolumnname} )  values ( ? )`
    const promises = env.theConnection.promises
    await promises.query(insertSql, [env.sql.LongVarBinary(binaryBuffer)])
    const selectSql = `select ${testcolumnname} from ${tablename}`
    const r = await promises.query(selectSql)
    expect(r.first[0].col1).to.deep.equal(binaryBuffer)
  })

  it('test 001 - verify functionality of data type \'smalldatetime\', fetch as date', async function handler () {
    //  var testcolumnsize = 16
    const testcolumntype = ' smalldatetime'
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const rowWithNullData = 1
    // test date = 1955-12-13 12:43:00
    const year = 1955
    const month = 12
    const day = 13
    const hour = 12
    const minute = 43
    const second = 0
    const nanosecond = 0
    const testdata2Expected = `${year}-${month}-${day} ${hour}:${minute}:${second}`
    const testdata2TsqlInsert = `'${testdata2Expected}'`
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    proxy.params.jsDateExpected = jsDateExpected
    proxy.params.rowWithNullData = rowWithNullData
    proxy.params.testcolumntype = testcolumntype
    proxy.params.testdata2TsqlInsert = testdata2TsqlInsert

    await proxy.testerDatetime()
  })

  it('test 002 - verify functionality of data type \'datetime\', fetch as date', async function handler () {
    // var testcolumnsize = 23
    const testcolumntype = ' datetime'
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const rowWithNullData = 2
    // test date = 2007-05-08 12:35:29.123
    const year = 2007
    const month = 5
    const day = 8
    const hour = 12
    const minute = 35
    const second = 29.123
    const nanosecond = 0
    const testdata2Expected = `${year}-${month}-${day} ${hour}:${minute}:${second}`
    const testdata2TsqlInsert = `'${testdata2Expected}'`
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.insert(null)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it(

  it('test 003_a - insert valid data into time(7) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 16
    const testdatetimescale = 7
    const testcolumntype = ` time(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = <default date> 12:10:05.1234567
    const year = 1900
    const month = 1
    const day = 1
    const hour = 12
    const minute = 10
    const second = 5
    const nanosecond = 0
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)
    const testdata2Expected = '12:10:05.1234567'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 003_b - insert valid data into time(0) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 16
    const testdatetimescale = 0
    const testcolumntype = ` time(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = <default date> 12:10:05
    const year = 1900
    const month = 1
    const day = 1
    const hour = 12
    const minute = 10
    const second = 5
    const nanosecond = 0
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)
    const testdata2Expected = '12:10:05.1234567'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 004_a - insert valid data into datetime2(7) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 27
    const testdatetimescale = 7
    const testcolumntype = ` datetime2(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2001-04-10 10:12:59.1234567
    const year = 2001
    const month = 4
    const day = 10
    const hour = 10
    const minute = 12
    const second = 59.1234567
    const nanosecond = 0
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)
    const testdata2Expected = '2001-04-10 10:12:59.1234567'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  })

  it('test 004_b - insert valid data into datetime2(0) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 19
    const testdatetimescale = 0
    const testcolumntype = ` datetime2(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2001-04-10 10:12:59.1234567
    const year = 2001
    const month = 4
    const day = 10
    const hour = 10
    const minute = 12
    const second = 59
    const nanosecond = 0
    // Month in JS is 0-based, so expected will be month minus 1
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)
    const testdata2Expected = '2001-04-10 10:12:59.1234567'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 005_a - insert valid data into datetimeoffset(7) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 34
    const testdatetimescale = 7
    const testcolumntype = ` datetimeoffset(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2001-04-10 10:12:59.1234567 +13:30
    const year = 2001
    const month = 4
    const day = 10
    const hour = 10
    const minute = 12
    const second = 59.1234567
    const nanosecond = 0
    const offsetHours = 13
    const offsetMinutes = 30
    // Month in JS is 0-based, so expected will be month minus 1

    const jsDateExpected = new Date(year, month - 1, day, hour, minute, second, nanosecond)
    jsDateExpected.setHours(jsDateExpected.getHours() - env.commonTestFns.getTimezoneOffsetInHours(year, month, day))
    jsDateExpected.setHours(jsDateExpected.getHours() - offsetHours)
    jsDateExpected.setMinutes(jsDateExpected.getMinutes() - offsetMinutes)

    const testdata2Expected = `2001-04-10 10:12:59.1234567 +${offsetHours}:${offsetMinutes}`
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 005_b - insert valid data into datetimeoffset(0) via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 26
    const testdatetimescale = 0
    const testcolumntype = ` datetimeoffset(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2001-04-10 10:12:59 +13:30
    const year = 2001
    const month = 4
    const day = 10
    const hour = 10
    const minute = 12
    const second = 59
    const nanosecond = 0
    const offsetHours = 13
    const offsetMinutes = 30
    // Month in JS is 0-based, so expected will be month minus 1

    const jsDateExpected = new Date(year, month - 1, day, hour, minute, second, nanosecond)
    jsDateExpected.setHours(jsDateExpected.getHours() - env.commonTestFns.getTimezoneOffsetInHours(year, month, day))
    jsDateExpected.setHours(jsDateExpected.getHours() - offsetHours)
    jsDateExpected.setMinutes(jsDateExpected.getMinutes() - offsetMinutes)

    const testdata2Expected = `2001-04-10 10:12:59.1234567 +${offsetHours}:${offsetMinutes}`
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 006_a - insert valid data into datetimeoffset(7) via TSQL, fetch as date UTC', async function handler () {
    //  var testcolumnsize = 34
    const testdatetimescale = 7
    const testcolumntype = ` datetimeoffset(${testdatetimescale})`
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2001-04-10 10:12:59 +13:30
    const year = 2001
    const month = 4
    const day = 10
    const hour = 10
    const minute = 12
    const second = 59
    const nanosecond = 0
    const offsetHours = 13
    const offsetMinutes = 30
    // Month in JS is 0-based, so expected will be month minus 1

    const jsDateExpected = new Date(Date.UTC(year, month - 1, day, hour, minute, second, nanosecond))
    jsDateExpected.setHours(jsDateExpected.getHours() - offsetHours)
    jsDateExpected.setMinutes(jsDateExpected.getMinutes() - offsetMinutes)

    const testdata2Expected = `2001-04-10 10:12:59.1234567 +${offsetHours}:${offsetMinutes}`
    const testdata2TsqlInsert = '\'' + testdata2Expected + '\''

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  it('test 007 - insert valid data into date via TSQL, fetch as date', async function handler () {
    //  var testcolumnsize = 10
    //  var testdatetimescale = 0
    const testcolumntype = ' date'
    //  var testcolumnclienttype = 'date'
    const testcolumnname = 'col2'
    const testdata1 = null
    const rowWithNullData = 1
    // test date = 2005-12-21
    const year = 2005
    const month = 12
    const day = 21
    const hour = 0
    const minute = 0
    const second = 0
    const nanosecond = 0
    const testdata2Expected = '2005-12-21'
    const testdata2TsqlInsert = `'${testdata2Expected}'`
    const jsDateExpected = new Date(year, month - 1, day, hour - env.commonTestFns.getTimezoneOffsetInHours(year, month, day), minute, second, nanosecond)

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData_Datetime(rowWithNullData, jsDateExpected, testname)
  }) // end of it()

  class ParamsTester {
    static A100CharacterString = '0234567890123456789022345678903234567890423456789052345678906234567890723456789082345678909234567890'
    static A2000CharacterString = ParamsTester.A100CharacterString.repeat(20)

    static makeExpected (testParams) {
      return {
        meta: [
          {
            name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity'
          },
          {
            name: testParams.testcolumnname,
            size: testParams.testcolumnsize,
            nullable: true,
            type: testParams.testcolumnclienttype,
            sqlType: testParams.testcolumnsqltype.trim()
          }
        ],
        rows: [
          [1, testParams.testdata1],
          [2, testParams.testdata2Expected]
        ]
      }
    }

    static async runTestParams (testParams) {
      const expected = ParamsTester.makeExpected(testParams)
      const proxy = env.makeTestFnProxy(tablename, testParams.testcolumnname)
      await proxy.create(testParams.testcolumntype)
      await proxy.insert(testParams.testdata1)
      await proxy.insert(testParams.testdata2TsqlInsert)
      await proxy.verifyData(expected, testParams.testname)
    }

    static inQuotes (s) {
      return `'${s}'`
    }

    static getUniqueIdentifierParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 36,
        testcolumntype: ' uniqueidentifier',
        testcolumnclienttype: 'text',
        testcolumnsqltype: 'uniqueidentifier',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getVarCharMaxParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 0,
        testcolumntype: ' varchar(max)',
        testcolumnclienttype: 'text',
        testcolumnsqltype: 'varchar',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getTinyIntxParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 3,
        testcolumntype: ' tinyint',
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'tinyint',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getSmallIntParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 5,
        testcolumntype: ' smallint',
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'smallint',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getIntParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 10,
        testcolumntype: ' int',
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'int',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getBitParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 1,
        testcolumntype: ' bit',
        testcolumnclienttype: 'boolean',
        testcolumnsqltype: 'bit',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getBigIntParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 19,
        testcolumntype: ' bigint',
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'bigint',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getNumericParams (testdata1, testdata2Expected, testdata2TsqlInsert, colSize, decPlaces) {
      colSize = colSize || 7
      decPlaces = decPlaces || 3
      return {
        testcolumnsize: colSize,
        testcolumntype: `numeric (${colSize}, ${decPlaces})`,
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'numeric',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getDecimalParams (testdata1, testdata2Expected, testdata2TsqlInsert, colSize, decPlaces) {
      colSize = colSize || 7
      decPlaces = decPlaces || 3
      return {
        testcolumnsize: colSize,
        testcolumntype: `decimal (${colSize}, ${decPlaces})`,
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'decimal',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }

    static getSmallMoneyParams (testdata1, testdata2Expected, testdata2TsqlInsert) {
      return {
        testcolumnsize: 10,
        testcolumntype: ' smallmoney',
        testcolumnclienttype: 'number',
        testcolumnsqltype: 'smallmoney',
        testcolumnname: 'col2',
        testdata1,
        testdata2Expected,
        testdata2TsqlInsert
      }
    }
  }

  it('test 008 - insert null into varchar(max) via TSQL, fetch as text', async function handler () {
    const s = 'string data row 2'
    const testParams = ParamsTester.getVarCharMaxParams(
      null,
      s,
      ParamsTester.inQuotes(s))
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  // currently, buffer size is 2048 characters, so a 2048 char string should not call 'more' in the OdbcConnection.cpp, but fetch entire result set at once.
  it('test 008_bndryCheck_VC - insert 2048 char string into varchar(max) via TSQL, fetch as text', async function handler () {
    const A2000CharacterString = ParamsTester.A2000CharacterString
    const testdata2Expected = 'AStringWith2048Characters_aaaa5aaa10aaa15aaa20aa' + A2000CharacterString
    const testParams = ParamsTester.getVarCharMaxParams(
      null,
      testdata2Expected,
      ParamsTester.inQuotes(testdata2Expected))
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  // currently, buffer size is 2048 characters, so a 2049 char string should call 'more' in the OdbcConnection.cpp and concatenate to correctly return larger data
  it('test 008_bndryCheck_NVC - insert 2049 char string into nvarchar(max) via TSQL, fetch as text', async function handler () {
    const A2000CharacterString = ParamsTester.A2000CharacterString
    const testdata2Expected = `AStringWith2049Characters_aaaa5aaa10aaa15aaa20aaa${A2000CharacterString}`
    const testParams = ParamsTester.getVarCharMaxParams(
      null,
      testdata2Expected,
      ParamsTester.inQuotes(testdata2Expected))
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 009 - verify functionality of data type \'guid\', fetch as text', async function handler () {
    const testdata2Expected = '0E984725-C51C-4BF4-9960-E1C80E27ABA0'
    const testParams = ParamsTester.getUniqueIdentifierParams(
      null,
      testdata2Expected,
      ParamsTester.inQuotes(testdata2Expected))
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 010 - verify functionality of data type \'tinyint\', fetch as number', async function handler () {
    const testdata2Expected = 255
    const testParams = ParamsTester.getTinyIntxParams(
      null,
      testdata2Expected,
      testdata2Expected)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 011 - verify functionality of data type \'smallint\', fetch as number', async function handler () {
    const testdata2Expected = 32767
    const testParams = ParamsTester.getSmallIntParams(
      null,
      testdata2Expected,
      testdata2Expected)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 012 - verify functionality of data type \'int\', fetch as number', async function handler () {
    const testdata2Expected = -2147483648
    const testParams = ParamsTester.getIntParams(
      null,
      testdata2Expected,
      testdata2Expected)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 013 - verify functionality of data type \'bigint\', fetch as number', async function handler () {
    const testdata2Expected = -9223372036854775808
    const testParams = ParamsTester.getBigIntParams(
      null,
      testdata2Expected,
      testdata2Expected)
    if (env.commonTestFns.SKIP_FAILING_HANGING_TEST_CASES === true) return
    await ParamsTester.runTestParams(testParams)
  })

  it('test 014 - verify functionality of data type \'smallmoney\', fetch as number', async function handler () {
    const testdata2Expected = 214748.3647
    const testParams = ParamsTester.getSmallMoneyParams(
      null,
      testdata2Expected,
      testdata2Expected)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 015 - verify functionality of data type \'money\', fetch as number', async function handler () {
    //  var testcolumnsize = 19
    const testcolumntype = ' money'
    //  var testcolumnclienttype = 'number'
    const testcolumnname = 'col2'
    const testdata1 = null
    // eslint-disable-next-line no-loss-of-precision
    const testdata2TsqlInsert = -922337203685477.5808

    const tsql = 'SELECT * FROM types_table ORDER BY id'
    const expectedError = `[Microsoft][${driver}][SQL Server]Arithmetic overflow`
    if (env.commonTestFns.SKIP_FAILING_HANGING_TEST_CASES === true) return

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.invalidQuery(tsql, expectedError)

    // end of it():
  })

  it('test 016 - verify functionality of data type \'numeric(7,3)\', fetch as number', async function handler () {
    const testdata2Expected = 1234.567
    const testParams = ParamsTester.getNumericParams(
      null,
      testdata2Expected,
      testdata2Expected, 7, 3)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 017 - verify functionality of data type \'decimal(7,3)\', fetch as number', async function handler () {
    const testdata2Expected = 1234.567
    const testParams = ParamsTester.getDecimalParams(
      null,
      testdata2Expected,
      testdata2Expected, 7, 3)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 018 - verify functionality of data type \'bit\', fetch as number', async function handler () {
    const testdata2TsqlInsert = 1
    const testParams = ParamsTester.getBitParams(
      null,
      testdata2TsqlInsert,
      testdata2TsqlInsert)
    await ParamsTester.runTestParams(testParams)
    // end of it():
  })

  it('test 019 - verify functionality of data type \'float(53)\', fetch as number', async function handler () {
    const testcolumnsize = 53
    const testcolumntype = ' float(53)'
    const testcolumnclienttype = 'number'
    const testcolumnsqltype = 'float'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = '1.79E+308'
    const testdata2TsqlInsert = testdata2Expected

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 020 - verify functionality of data type \'real\', fetch as number', async function handler () {
    const testcolumnsize = 24
    const testcolumntype = ' real'
    const testcolumnclienttype = 'number'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = '44.44000244140625'
    const testdata2TsqlInsert = testdata2Expected

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumntype.trim()
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 021 - verify functionality of data type \'binary(n)\', fetch as binary', async function handler () {
    const testcolumnsize = 10
    const testcolumntype = ` binary(${testcolumnsize})`
    const testcolumnclienttype = 'binary'
    const testcolumnsqltype = 'binary'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2TsqlInsert = 0x0123

    const binaryBuffer = Buffer.from('00000000000000000123', 'hex')

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, binaryBuffer]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 022 - verify functionality of data type \'varbinary(n)\', fetch as binary', async function handler () {
    const testcolumnsize = 10
    const testcolumntype = ` varbinary(${testcolumnsize})`
    const testcolumnclienttype = 'binary'
    const testcolumnsqltype = 'varbinary'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2TsqlInsert = 0x0123

    const binaryBuffer = Buffer.from('00000123', 'hex')

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, binaryBuffer]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 023 - verify functionality of data type \'varbinary(max)\', fetch as binary', async function handler () {
    const testcolumnsize = 0
    const testcolumntype = ' varbinary(max)'
    const testcolumnclienttype = 'binary'
    const testcolumnsqltype = 'varbinary'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2TsqlInsert = 'CONVERT(varbinary(max), 0x0123456789AB)'
    const binaryBuffer = Buffer.from('0123456789AB', 'hex')
    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, binaryBuffer]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 023a - fetch large varbinary in chunks \'varbinary(max)\', fetch as binary', async function handler () {
    const testcolumntype = ' varbinary(' + 'max' + ')'
    const testcolumnname = 'col1'

    const buffer = []
    let i
    for (i = 0; i < 2 * 1024 * 1024; ++i) {
      buffer[buffer.length] = i % 255
    }

    const binaryBuffer = Buffer.from(buffer)
    await env.commonTestFnPromises.create(env.theConnection, tablename, testcolumnname, testcolumntype)
    const promises = env.theConnection.promises
    const insertSql = `insert into ${tablename} (${testcolumnname} )  values ( ? )`
    await promises.query(insertSql, [binaryBuffer])
    const selectSql = `select ${testcolumnname} from ${tablename}`
    const r = await promises.query(selectSql, [binaryBuffer])
    expect(r.first[0].col1).to.deep.equal(binaryBuffer)
  })

  it('test 024 - verify functionality of data type \'image\', fetch as binary', async function handler () {
    const testcolumnsize = 2147483647
    const testcolumntype = ' image'
    const testcolumnclienttype = 'binary'
    const testcolumnname = 'col2'
    const testdata1 = null
    //  var testdata2Expected = 0x0123
    const testdata2TsqlInsert = 'CONVERT(varbinary(50), 0x0123456789AB)'
    const binaryBuffer = Buffer.from('0123456789AB', 'hex')

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumntype.trim()
        }],
      rows: [[1, testdata1],
        [2, binaryBuffer]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 025 - verify functionality of data type \'xml\', fetch as text', async function handler () {
    const testcolumnsize = 0
    const testcolumntype = ' xml'
    const testcolumnclienttype = 'text'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = '<data>zzzzz</data>'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumntype.trim()
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    if (env.commonTestFns.SKIP_FAILING_TEST_ISSUE_36 === true) return

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 026 - verify functionality of data type \'char\', fetch as text', async function handler () {
    const testcolumnsize = 10
    const testcolumntype = ` char(${testcolumnsize})`
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'char'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'char data '
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 027 - verify functionality of data type \'varchar(n)\', fetch as text', async function handler () {
    const testcolumnsize = 20
    const testcolumntype = ` varchar(${testcolumnsize})`
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'varchar'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'varchar data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 028 - verify functionality of data type \'varchar(max)\', fetch as text', async function handler () {
    const testcolumnsize = 0
    const testcolumntype = ' varchar(max)'
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'varchar'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'varchar_max data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 029 - verify functionality of data type \'text\', fetch as text', async function handler () {
    const testcolumnsize = 2147483647
    const testcolumntype = ' text'
    const testcolumnclienttype = 'text'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'text data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumntype.trim()
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 030 - verify functionality of data type \'nchar\', fetch as text', async function handler () {
    const testcolumnsize = 10
    const testcolumntype = ` nchar(${testcolumnsize})`
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'nchar'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'char data '
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 031 - verify functionality of data type \'nvarchar(n)\', fetch as text', async function handler () {
    const testcolumnsize = 20
    const testcolumntype = ` nvarchar(${testcolumnsize})`
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'nvarchar'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'nvarchar data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 032 - verify functionality of data type \'nvarchar(max)\', fetch as text', async function handler () {
    const testcolumnsize = 0
    const testcolumntype = ' nvarchar(max)'
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'nvarchar'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'nvarchar_max data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumnsqltype
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 033 - verify functionality of data type \'ntext\', fetch as text', async function handler () {
    const testcolumnsize = 1073741823
    const testcolumntype = ' ntext'
    const testcolumnclienttype = 'text'
    const testcolumnname = 'col2'
    const testdata1 = null
    const testdata2Expected = 'ntext data'
    const testdata2TsqlInsert = `'${testdata2Expected}'`

    const expected = {
      meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
        {
          name: testcolumnname,
          size: testcolumnsize,
          nullable: true,
          type: testcolumnclienttype,
          sqlType: testcolumntype.trim()
        }],
      rows: [[1, testdata1],
        [2, testdata2Expected]]
    }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
    // end of it():
  })

  it('test 034 - verify functionality of data type \'sysname\', fetch as text', async function handler () {
    const testcolumnsize = 128
    const testcolumntype = ' sysname'
    const testcolumnclienttype = 'text'
    const testcolumnsqltype = 'nvarchar'
    const testcolumnname = 'col2'
    const testdata1Expected = ''
    const testdata1TsqlInsert = `'${testdata1Expected}'`
    const testdata2Expected = 'sysname data'
    const testdata2TsqlInsert = '\'' + testdata2Expected + '\''

    const expected =
      {
        meta: [{ name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
          {
            name: testcolumnname,
            size: testcolumnsize,
            nullable: false,
            type: testcolumnclienttype,
            sqlType: testcolumnsqltype
          }],
        rows: [[1, testdata1Expected],
          [2, testdata2Expected]]
      }

    const proxy = env.makeTestFnProxy(tablename, testcolumnname)
    await proxy.create(testcolumntype)
    await proxy.insert(testdata1TsqlInsert)
    await proxy.insert(testdata2TsqlInsert)
    await proxy.verifyData(expected, testname)
  })
})
