'use strict'
/* global suite teardown teardown test setup */

var supp = require('../samples/typescript/demo-support')
var assert = require('assert')
var path = require('path')

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
function GeographyHelper () {
  function createGeographyTable (async, theConnection, done) {
    var insertProcedureTypeName = 'InsertGeographyTvp'
    var tableTypeName = 'geographyTvpType'
    var createTableSql = 'CREATE TABLE spatial_test ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText() )'
    var dropProcedureSql = 'IF EXISTS (SELECT * FROM sys.objects WHERE type = \'P\' AND OBJECT_ID = OBJECT_ID(\'' + insertProcedureTypeName + '\'))\n' +
      ' begin' +
      ' drop PROCEDURE ' + insertProcedureTypeName +
      ' end '
    var dropTypeSql = 'IF TYPE_ID(N\'' + tableTypeName + '\') IS not NULL drop type ' + tableTypeName
    var createType = 'create type ' + tableTypeName + ' AS TABLE ([GeogCol1] nvarchar (2048))'
    var createProcedureSql = 'create PROCEDURE InsertGeographyTvp ' +
      '@tvp geographyTvpType READONLY\n' +
      '       AS \n' +
      '       BEGIN \n' +
      '       set nocount on\n' +
      '       INSERT INTO spatial_test \n' +
      '       ( \n' +
      '          GeogCol1\n' +
      '        )\n' +
      'SELECT  (case\n' +
      'when GeogCol1 like \'POINT%\'\n' +
      ' then geography::STPointFromText([GeogCol1], 4326)\n' +
      'when GeogCol1 like \'LINE%\'\n' +
      ' then geography::STLineFromText([GeogCol1], 4326)\n' +
      'when GeogCol1 like \'POLY%\'\n' +
      'then geography::STPolyFromText([GeogCol1], 4326)\n' +
      'end)\n' +
      '  n FROM @tvp tvp\n' +
      '  END\n'
    var table
    var fns = [

      function (asyncDone) {
        theConnection.query('DROP TABLE spatial_test', function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(createTableSql, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(dropProcedureSql, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(dropTypeSql, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(createType, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(createProcedureSql, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.getUserTypeTable(tableTypeName, function (err, t) {
          assert.ifError(err)
          table = t
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      done(table)
    })
  }

  var points = [
    'POINT (-89.349 -55.349)',
    'POINT (1.349 -9.349)'
  ]

  var lines = [
    'LINESTRING (-0.19535064697265625 51.509249951770364, -0.19148826599121094 51.5100245354003)'
  ]

  var insertPolySql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STPolyFromText(?, 4326))'
  var insertPointsSql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STPointFromText(?, 4326))'
  var insertLinesSql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STLineFromText(?, 4326))'
  var selectSql = 'select id, GeogCol2 from spatial_test'

  var expectedPoints = [
    {
      id: 1,
      GeogCol2: points[0]
    },
    {
      id: 2,
      GeogCol2: points[1]
    }
  ]

  var expectedLines = [
    {
      id: 1,
      GeogCol2: lines[0]
    }
  ]

  function getJSON (stem) {
    var p = stem || './json'
    var folder = path.join(__dirname, p)
    var fs = require('fs')

    return JSON.parse(fs.readFileSync(folder + '/points.json', 'utf8'))
  }

  function getCoordinates () {
    var json = getJSON()
    return json.features[0].geometry.coordinates
  }

  function asPair (elem) {
    var dp = 13
    return +elem[0].toFixed(dp) + ' ' + +elem[1].toFixed(dp)
  }

  function asPoly (coordinates) {
    // close the polygon
    coordinates = coordinates.slice(0)
    coordinates[coordinates.length] = coordinates[0]
    var s = coordinates.map(function (elem) {
      return asPair(elem)
    })
    return 'POLYGON ((' + s.join(', ') + '))'
  }

  function asLine (coords) {
    // 'LINESTRING (-0.19535064697265625 51.509249951770364, -0.19148826599121094 51.5100245354003)'
    return 'LINESTRING (' + asPair(coords[0]) + ', ' + asPair(coords[1]) + ')'
  }

  function asLines (coordinates) {
    var i
    var res = []
    var step = 2
    var max = Math.floor(coordinates.length / step)
    for (i = 0; i < max * step; i += step) {
      var sliced = coordinates.slice(i, i + step)
      res[res.length] = asLine(sliced)
    }
    return res
  }

  function asPoints (coordinates) {
    // 'POINT (-89.349 -55.349)',
    return coordinates.map(function (elem) {
      return 'POINT (' + asPair(elem) + ')'
    })
  }

  function asExpected (geography) {
    var i
    var expected = []
    for (i = 0; i < geography.length; ++i) {
      expected[expected.length] = {
        id: i + 1,
        GeogCol2: geography[i]
      }
    }
    return expected
  }

  return {
    asExpected: asExpected,
    asLines: asLines,
    asPoly: asPoly,
    asPoints: asPoints,
    getJSON: getJSON,
    getCoordinates: getCoordinates,
    createGeographyTable: createGeographyTable,
    insertPolySql: insertPolySql,
    expectedLines: expectedLines,
    insertPointsSql: insertPointsSql,
    insertLinesSql: insertLinesSql,
    selectSql: selectSql,
    expectedPoints: expectedPoints,
    lines: lines,
    points: points
  }
}

suite('geography', function () {
  var theConnection
  this.timeout(20000)
  var connStr
  var async
  var helper
  var geographyHelper

  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      geographyHelper = new GeographyHelper()
      sql.open(connStr, function (err, newConn) {
        assert(err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert.ifError(err)
      done()
    })
  })

  test('show a geography .Net error is reported back from driver', function (testDone) {
    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertPointsSql, ['PINT (-89.349 -55.349)'], function (err, res) { // deliberate error
          assert(err)
          assert(err.message.indexOf('Expected "POINT" at position 1') > 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('use tvp to insert geography LINES using pm', function (testDone) {
    var table
    var procedure
    var coordinates = geographyHelper.getCoordinates()
    var lines = geographyHelper.asLines(coordinates)
    var expected = geographyHelper.asExpected(lines)
    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function (t) {
          table = t
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get('InsertGeographyTvp', function (p) {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      function (asyncDone) {
        lines.forEach(function (l) {
          // each row is represented as an array of columns
          table.rows[table.rows.length] = [l]
        })
        var tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepEqual(res, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('use tvp to insert geography LINESTRING, POINT and POLYGON using pm in 1 call', function (testDone) {
    var table
    var procedure
    var coordinates = geographyHelper.getCoordinates()
    var lines = geographyHelper.asLines(coordinates)
    var points = geographyHelper.asPoints(coordinates)
    var polygon = geographyHelper.asPoly(coordinates)
    var allGeography = lines.concat(points).concat(polygon)
    var expected = geographyHelper.asExpected(allGeography)
    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function (t) {
          table = t
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get('InsertGeographyTvp', function (p) {
          assert(p)
          procedure = p
          asyncDone()
        })
      },
      function (asyncDone) {
        allGeography.forEach(function (l) {
          // each row is represented as an array of columns
          table.rows[table.rows.length] = [l]
        })
        var tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === allGeography.length)
          assert.deepEqual(res, expected)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('insert lines from json coordinates', function (testDone) {
    var coordinates = geographyHelper.getCoordinates()
    var lines = geographyHelper.asLines(coordinates)
    var expected = geographyHelper.asExpected(lines)

    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertLinesSql, [lines], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepEqual(res, expected)
          asyncDone()
        })
      }]

    async.series(fns, function () {
      testDone()
    })
  })

  test('insert points from json coordinates', function (testDone) {
    var coordinates = geographyHelper.getCoordinates()
    var points = geographyHelper.asPoints(coordinates)
    var expected = geographyHelper.asExpected(points)

    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertPointsSql, [points], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === points.length)
          assert.deepEqual(expected, res)
          asyncDone()
        })
      }]

    async.series(fns, function () {
      testDone()
    })
  })

  test('insert a polygon from json coordinates', function (testDone) {
    var coordinates = geographyHelper.getCoordinates()
    var poly = geographyHelper.asPoly(coordinates)
    var expectedPoly = [
      {
        id: 1,
        GeogCol2: poly
      }
    ]

    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertPolySql, [poly], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === expectedPoly.length)
          assert.deepEqual(res, expectedPoly)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('insert an array of geography lines', function (testDone) {
    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertLinesSql, [geographyHelper.lines], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === geographyHelper.expectedLines.length)
          assert.deepEqual(res, geographyHelper.expectedLines)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })

  test('insert an array of geography points', function (testDone) {
    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.insertPointsSql, [geographyHelper.points], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert.ifError(err)
          assert(res.length === geographyHelper.expectedPoints.length)
          assert.deepEqual(res, geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })

  test('prepare a geography point statement for repeat invocations', function (testDone) {
    var preparedPoint = null

    var fns = [

      function (asyncDone) {
        geographyHelper.createGeographyTable(async, theConnection, function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.prepare(geographyHelper.insertPointsSql, function (err, prepared) {
          assert(err === false)
          preparedPoint = prepared
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([geographyHelper.points[0]], function (err, res) {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([geographyHelper.points[1]], function (err, res) {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query(geographyHelper.selectSql, function (err, res) {
          assert(err === null)
          assert(res.length === geographyHelper.expectedPoints.length)
          assert.deepEqual(res, geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })
})
