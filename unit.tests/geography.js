'use strict'
/* global suite teardown teardown test setup */

var supp = require('../samples/typescript/demo-support')
var assert = require('assert')
var path = require('path')

function GeographyHelper () {
  function createGeographyTable (async, theConnection, done) {
    var fns = [

      function (asyncDone) {
        theConnection.query('DROP TABLE spatial_test', function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query('CREATE TABLE spatial_test ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText() )', function (e) {
          assert.ifError(e)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      done()
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

  function asPoly (coordinates) {
    // close the polygon
    coordinates = coordinates.slice(0)
    coordinates[coordinates.length] = coordinates[0]
    var dp = 10
    var s = coordinates.map(function (elem) {
      return +elem[0].toFixed(dp) + ' ' + +elem[1].toFixed(dp)
    })
    return 'POLYGON ((' + s.join(', ') + '))'
  }

  function asLine (coords) {
    // 'LINESTRING (-0.19535064697265625 51.509249951770364, -0.19148826599121094 51.5100245354003)'
    return 'LINESTRING (' + coords[0][0] + ' ' + coords[0][1] + ', ' + coords[1][0] + ' ' + coords[1][1] + ')'
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

  var api = {
    asLines: asLines,
    asPoly: asPoly,
    getJSON: getJSON,
    insertPolySql: insertPolySql,
    expectedLines: expectedLines,
    insertPointsSql: insertPointsSql,
    insertLinesSql: insertLinesSql,
    selectSql: selectSql,
    createGeographyTable: createGeographyTable,
    expectedPoints: expectedPoints,
    lines: lines,
    points: points
  }

  return api
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
        assert.ifError(err)
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

  test('insert lines from json coordinates', function (testDone) {
    var json = geographyHelper.getJSON()
    var coordinates = json.features[0].geometry.coordinates
    var lines = geographyHelper.asLines(coordinates)

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
          asyncDone()
        })
      }]

    async.series(fns, function () {
      testDone()
    })
  })

  test('insert a polygon from json coordinates', function (testDone) {
    var json = geographyHelper.getJSON()
    var coordinates = json.features[0].geometry.coordinates
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
          assert.ifError(err)
          preparedPoint = prepared
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([geographyHelper.points[0]], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([geographyHelper.points[1]], function (err, res) {
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
})
