'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
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

describe('geography', function () {
  this.timeout(20000)

  this.beforeEach(done => {
    env.open().then(() => {
      done()
    })
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('use tvp to insert geography LINES using pm', testDone => {
    let table
    let procedure
    const coordinates = env.geographyHelper.getCoordinates()
    const lines = env.geographyHelper.asLines(coordinates)
    const expected = env.geographyHelper.asExpected(lines)
    const fns = [

      async asyncDone => {
        table = await env.geographyHelper.createGeographyTable()
        asyncDone()
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
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
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('show a geography .Net error is reported back from driver', testDone => {
    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertPointsSql, ['PINT (-89.349 -55.349)'], err => { // deliberate error
          assert(err)
          assert(err.message.indexOf('Expected "POINT" at position 1') > 0)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp to insert geography LINESTRING, POINT and POLYGON using pm in 1 call', testDone => {
    let table
    let procedure
    const coordinates = env.geographyHelper.getCoordinates()
    const lines = env.geographyHelper.asLines(coordinates)
    const points = env.geographyHelper.asPoints(coordinates)
    const polygon = env.geographyHelper.asPoly(coordinates)
    const allGeography = lines.concat(points).concat(polygon)
    const expected = env.geographyHelper.asExpected(allGeography)
    const fns = [

      async asyncDone => {
        table = await env.geographyHelper.createGeographyTable()
        asyncDone()
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
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
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === allGeography.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('insert lines from json coordinates', testDone => {
    const coordinates = env.geographyHelper.getCoordinates()
    const lines = env.geographyHelper.asLines(coordinates)
    const expected = env.geographyHelper.asExpected(lines)

    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertLinesSql, [lines], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === lines.length)
          assert.deepStrictEqual(res, expected)
          asyncDone()
        })
      }]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('insert points from json coordinates', testDone => {
    const coordinates = env.geographyHelper.getCoordinates()
    const points = env.geographyHelper.asPoints(coordinates)
    const expected = env.geographyHelper.asExpected(points)

    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertPointsSql, [points], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === points.length)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('insert a polygon from json coordinates', testDone => {
    const coordinates = env.geographyHelper.getCoordinates()
    const poly = env.geographyHelper.asPoly(coordinates)
    const expectedPoly = [
      {
        id: 1,
        GeogCol2: poly
      }
    ]

    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertPolySql, [poly], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === expectedPoly.length)
          assert.deepStrictEqual(res, expectedPoly)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('insert an array of geography lines', testDone => {
    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertLinesSql, [env.geographyHelper.lines], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === env.geographyHelper.expectedLines.length)
          assert.deepStrictEqual(res, env.geographyHelper.expectedLines)
          asyncDone()
        })
      }
    ]
    env.async.series(fns, () => {
      testDone()
    })
  })

  it('insert an array of geography points', testDone => {
    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.insertPointsSql, [env.geographyHelper.points], (err, res) => {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert.ifError(err)
          assert(res.length === env.geographyHelper.expectedPoints.length)
          assert.deepStrictEqual(res, env.geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    env.async.series(fns, () => {
      testDone()
    })
  })

  it('prepare a geography point statement for repeat invocations', testDone => {
    let preparedPoint = null

    const fns = [

      async asyncDone => {
        await env.geographyHelper.createGeographyTable()
        asyncDone()
      },
      asyncDone => {
        env.theConnection.prepare(env.geographyHelper.insertPointsSql, (err, prepared) => {
          assert(err === false)
          preparedPoint = prepared
          asyncDone()
        })
      },
      asyncDone => {
        preparedPoint.preparedQuery([env.geographyHelper.points[0]], (err, res) => {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        preparedPoint.preparedQuery([env.geographyHelper.points[1]], (err, res) => {
          assert(err === null)
          assert(res.length === 0)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(env.geographyHelper.selectSql, (err, res) => {
          assert(err === null)
          assert(res.length === env.geographyHelper.expectedPoints.length)
          assert.deepStrictEqual(res, env.geographyHelper.expectedPoints)
          asyncDone()
        })
      }
    ]
    env.async.series(fns, () => {
      testDone()
    })
  })
})
