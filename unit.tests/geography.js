'use strict'
/* global suite teardown teardown test setup */

const supp = require('../samples/typescript/demo-support')
const assert = require('assert')
const path = require('path')
const util = require('util')

/*
create PROCEDURE InsertGeographyTvp @tvp geographyTvpType READONLY
       AS
       BEGIN
       set nocount on
       INSERT INTO spatial_test
       (
          GeogCol1
        )
SELECT  (case
when GeogCol1 like 'POINT%'
 then geography::STPointFromText([GeogCol1], 4326)
when GeogCol1 like 'LINE%'
 then geography::STLineFromText([GeogCol1], 4326)
when GeogCol1 like 'POLY%'
then geography::STPolyFromText([GeogCol1], 4326)
end )
  n FROM @tvp tvp
  END
 */
class GeographyHelper {
  constructor (theConnection) {
    const tableName = 'spatial_test'
    const insertProcedureTypeName = 'InsertGeographyTvp'
    const tableTypeName = 'geographyTvpType'
    const createTableSql = `CREATE TABLE ${tableName} ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText() )`
    const dropProcedureSql = `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${insertProcedureTypeName}'))
begin drop PROCEDURE ${insertProcedureTypeName} end `
    const dropTypeSql = `IF TYPE_ID(N'${tableTypeName}') IS not NULL drop type ${tableTypeName}`
    const createType = `create type ${tableTypeName} AS TABLE ([GeogCol1] nvarchar (2048))`
    const createProcedureSql = `create PROCEDURE InsertGeographyTvp @tvp geographyTvpType READONLY
     AS 
     BEGIN 
     set nocount on
     INSERT INTO spatial_test 
     ( 
        GeogCol1
      )
SELECT  (case
when GeogCol1 like 'POINT%'
then geography::STPointFromText([GeogCol1], 4326)
when GeogCol1 like 'LINE%'
then geography::STLineFromText([GeogCol1], 4326)
when GeogCol1 like 'POLY%'
then geography::STPolyFromText([GeogCol1], 4326)
end)
n FROM @tvp tvp
END
`
    const dropTableSql = `IF OBJECT_ID(N'dbo.${tableName}', N'U') IS NOT NULL
    BEGIN
      DROP TABLE ${tableName}
    END`

    const points = [
      'POINT (-89.349 -55.349)',
      'POINT (1.349 -9.349)'
    ]

    const lines = [
      'LINESTRING (-0.19535064697265625 51.509249951770364, -0.19148826599121094 51.5100245354003)'
    ]

    const insertPolySql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STPolyFromText(?, 4326))'
    const insertPointsSql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STPointFromText(?, 4326))'
    const insertLinesSql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STLineFromText(?, 4326))'
    const selectSql = 'select id, GeogCol2 from spatial_test'

    async function createGeographyTable () {
      async function exec (sql) {
        const promisedQuery = util.promisify(theConnection.query)
        await promisedQuery(sql)
      }

      await exec(dropTableSql)
      await exec(createTableSql)
      await exec(dropProcedureSql)
      await exec(dropTypeSql)
      await exec(createType)
      await exec(createProcedureSql)
      const promisedUserType = util.promisify(theConnection.getUserTypeTable)
      const table = await promisedUserType(tableTypeName)
      return table
    }

    const expectedPoints = [
      {
        id: 1,
        GeogCol2: points[0]
      },
      {
        id: 2,
        GeogCol2: points[1]
      }
    ]

    const expectedLines = [
      {
        id: 1,
        GeogCol2: lines[0]
      }
    ]

    function getJSON (stem) {
      const p = stem || './json'
      const folder = path.join(__dirname, p)
      const fs = require('fs')

      return JSON.parse(fs.readFileSync(folder + '/points.json', 'utf8'))
    }

    function getCoordinates () {
      const json = getJSON()
      return json.features[0].geometry.coordinates
    }

    function asPair (elem) {
      const dp = 13
      return `${+elem[0].toFixed(dp)} ${+elem[1].toFixed(dp)}`
    }

    function asPoly (coordinates) {
    // close the polygon
      coordinates = coordinates.slice(0)
      coordinates[coordinates.length] = coordinates[0]
      const s = coordinates.map(elem => asPair(elem))
      return `POLYGON ((${s.join(', ')}))`
    }

    function all (coordinates) {
      const lines = this.asLines(coordinates)
      const points = this.asPoints(coordinates)
      const polygon = this.asPoly(coordinates)
      const allGeography = lines.concat(points).concat(polygon)
      return allGeography
    }

    function asLine (coords) {
    // 'LINESTRING (-0.19535064697265625 51.509249951770364, -0.19148826599121094 51.5100245354003)'
      return `LINESTRING (${asPair(coords[0])}, ${asPair(coords[1])})`
    }

    function asLines (coordinates) {
      const res = []
      const step = 2
      const max = Math.floor(coordinates.length / step)
      for (let i = 0; i < max * step; i += step) {
        const sliced = coordinates.slice(i, i + step)
        res[res.length] = asLine(sliced)
      }
      return res
    }

    function asPoints (coordinates) {
    // 'POINT (-89.349 -55.349)',
      return coordinates.map(elem => `POINT (${asPair(elem)})`)
    }

    function asExpected (geography) {
      const expected = []
      for (let i = 0; i < geography.length; ++i) {
        expected[expected.length] = {
          id: i + 1,
          GeogCol2: geography[i]
        }
      }
      return expected
    }

    this.all = all
    this.asExpected = asExpected
    this.asLines = asLines
    this.asPoly = asPoly
    this.asPoints = asPoints
    this.getJSON = getJSON
    this.getCoordinates = getCoordinates
    this.createGeographyTable = createGeographyTable
    this.insertPolySql = insertPolySql
    this.expectedLines = expectedLines
    this.insertPointsSql = insertPointsSql
    this.insertLinesSql = insertLinesSql
    this.selectSql = selectSql
    this.expectedPoints = expectedPoints
    this.lines = lines
    this.points = points
  }
}

suite('geography', function () {
  let theConnection
  this.timeout(20000)
  let connStr
  let async
  let helper
  let geographyHelper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === false)
        theConnection = newConn
        geographyHelper = new GeographyHelper(theConnection)
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

  test('use tvp to insert geography LINES using pm', testDone => {
    let table
    let procedure
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const expected = geographyHelper.asExpected(lines)
    const fns = [

      async asyncDone => {
        table = await geographyHelper.createGeographyTable()
        asyncDone()
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('InsertGeographyTvp', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        lines.forEach(l => {
          // each row is represented as an array of columns
          table.rows[table.rows.length] = [l]
        })
        const tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('show a geography .Net error is reported back from driver', testDone => {
    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertPointsSql, ['PINT (-89.349 -55.349)'], err => { // deliberate error
          assert(err)
          assert(err.message.indexOf('Expected "POINT" at position 1') > 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('use tvp to insert geography LINESTRING, POINT and POLYGON using pm in 1 call', testDone => {
    let table
    let procedure
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const points = geographyHelper.asPoints(coordinates)
    const polygon = geographyHelper.asPoly(coordinates)
    const allGeography = lines.concat(points).concat(polygon)
    const expected = geographyHelper.asExpected(allGeography)
    const fns = [

      async asyncDone => {
        table = await geographyHelper.createGeographyTable()
        asyncDone()
      },

      asyncDone => {
        const pm = theConnection.procedureMgr()
        pm.get('InsertGeographyTvp', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },
      asyncDone => {
        allGeography.forEach(l => {
          // each row is represented as an array of columns
          table.rows[table.rows.length] = [l]
        })
        const tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === allGeography.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('insert lines from json coordinates', testDone => {
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const expected = geographyHelper.asExpected(lines)

    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertLinesSql, [lines], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }]

    async.series(fns, () => {
      testDone()
    })
  })

  test('insert points from json coordinates', testDone => {
    const coordinates = geographyHelper.getCoordinates()
    const points = geographyHelper.asPoints(coordinates)
    const expected = geographyHelper.asExpected(points)

    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertPointsSql, [points], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === points.length)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }]

    async.series(fns, () => {
      testDone()
    })
  })

  test('insert a polygon from json coordinates', testDone => {
    const coordinates = geographyHelper.getCoordinates()
    const poly = geographyHelper.asPoly(coordinates)
    const expectedPoly = [
      {
        id: 1,
        GeogCol2: poly
      }
    ]

    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertPolySql, [poly], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === expectedPoly.length)
          assert.deepStrictEqual(res, expectedPoly)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('insert an array of geography lines', testDone => {
    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertLinesSql, [geographyHelper.lines], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === geographyHelper.expectedLines.length)
          assert.deepStrictEqual(res, geographyHelper.expectedLines)
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      testDone()
    })
  })

  test('insert an array of geography points', testDone => {
    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.query(geographyHelper.insertPointsSql, [geographyHelper.points], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === geographyHelper.expectedPoints.length)
          assert.deepStrictEqual(res, geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      testDone()
    })
  })

  test('prepare a geography point statement for repeat invocations', testDone => {
    let preparedPoint = null

    const fns = [

      async asyncDone => {
        await geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        theConnection.prepare(geographyHelper.insertPointsSql, (err, prepared) => {
          assert(err === false)
          preparedPoint = prepared
          asyncDone()
        })
      },
      asyncDone => {
        preparedPoint.preparedQuery([geographyHelper.points[0]], (err, res) => {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        preparedPoint.preparedQuery([geographyHelper.points[1]], (err, res) => {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(geographyHelper.selectSql, (err, res) => {
          assert(err === null)
          assert(res.length === geographyHelper.expectedPoints.length)
          assert.deepStrictEqual(res, geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      testDone()
    })
  })
})
