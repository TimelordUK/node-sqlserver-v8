'use strict'

/* globals describe it */

const assert = require('chai').assert
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

  function getTVPTable (vec, table) {
    vec.forEach(l => {
      // each row is represented as an array of columns
      table.rows[table.rows.length] = [l]
    })
    return env.sql.TvpFromTable(table)
  }

  it('use tvp to insert geography LINES using pm', async function handler () {
    const coordinates = env.geographyHelper.getCoordinates()
    const lines = env.geographyHelper.asLines(coordinates)
    const expected = env.geographyHelper.asExpected(lines)
    const table = await env.geographyHelper.createGeographyTable()
    const tp = getTVPTable(lines, table)
    table.rows = []
    await env.theConnection.promises.callProc('InsertGeographyTvp', [tp])
    const res = await env.theConnection.promises.query(env.geographyHelper.selectSql)
    assert.deepStrictEqual(res.first, expected)
  })

  it('show a geography .Net error is reported back from driver', async function handler () {
    await env.geographyHelper.createGeographyTable()
    try {
      const res = await env.theConnection.query(env.geographyHelper.insertPointsSql, ['PINT (-89.349 -55.349)'])
      assert(res)
    } catch (e) {
      assert(e.message.indexOf('Expected "POINT" at position 1') > 0)
    }
  })

  it('use tvp to insert geography LINESTRING, POINT and POLYGON using pm in 1 call', async function handler () {
    const geographyHelper = env.geographyHelper
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const points = geographyHelper.asPoints(coordinates)
    const polygon = geographyHelper.asPoly(coordinates)
    const allGeography = lines.concat(points).concat(polygon)
    const expected = geographyHelper.asExpected(allGeography)

    const table = await geographyHelper.createGeographyTable()
    const tp = getTVPTable(allGeography, table)
    table.rows = []
    await env.theConnection.promises.callProc('InsertGeographyTvp', [tp])
    const res = await env.theConnection.promises.query(geographyHelper.selectSql)
    assert.deepStrictEqual(res.first.length, allGeography.length)
    assert.deepStrictEqual(res.first, expected)
  })

  async function createCheck (sql, vec, expected) {
    await env.geographyHelper.createGeographyTable()
    await env.theConnection.promises.query(sql, [vec])
    const res = await env.theConnection.promises.query(env.geographyHelper.selectSql)
    assert.deepStrictEqual(res.first.length, vec.length)
    assert.deepStrictEqual(res.first, expected)
  }

  it('insert lines from json coordinates', async function handler () {
    const geographyHelper = env.geographyHelper
    const coordinates = geographyHelper.getCoordinates()
    const lines = geographyHelper.asLines(coordinates)
    const expected = geographyHelper.asExpected(lines)
    await createCheck(geographyHelper.insertLinesSql, lines, expected)
  })

  it('insert points from json coordinates', async function handler () {
    const geographyHelper = env.geographyHelper
    const coordinates = geographyHelper.getCoordinates()
    const points = geographyHelper.asPoints(coordinates)
    const expected = geographyHelper.asExpected(points)
    await createCheck(geographyHelper.insertPointsSql, points, expected)
  })

  it('insert a polygon from json coordinates', async function handler () {
    const geographyHelper = env.geographyHelper
    const coordinates = geographyHelper.getCoordinates()
    const poly = geographyHelper.asPoly(coordinates)
    const expectedPoly = [
      {
        id: 1,
        GeogCol2: poly
      }
    ]

    await env.geographyHelper.createGeographyTable()
    await env.theConnection.promises.query(geographyHelper.insertPolySql, [poly])
    const res = await env.theConnection.promises.query(geographyHelper.selectSql)
    assert.deepStrictEqual(res.first.length, expectedPoly.length)
    assert.deepStrictEqual(res.first, expectedPoly)
  })

  it('insert an array of geography lines', async function handler () {
    const geographyHelper = env.geographyHelper
    const lines = geographyHelper.lines
    const expected = geographyHelper.expectedLines
    await env.geographyHelper.createGeographyTable()
    await env.theConnection.promises.query(geographyHelper.insertLinesSql, [lines])
    const res = await env.theConnection.promises.query(geographyHelper.selectSql)
    assert.deepStrictEqual(res.first.length, lines.length)
    assert.deepStrictEqual(res.first, expected)
  })

  it('insert an array of geography points', async function handler () {
    const geographyHelper = env.geographyHelper
    const points = geographyHelper.points
    const expected = geographyHelper.expectedPoints
    await createCheck(geographyHelper.insertPointsSql, points, expected)
  })

  it('prepare a geography point statement for repeat invocations', async function handler () {
    const geographyHelper = env.geographyHelper
    await env.geographyHelper.createGeographyTable()
    const preparedPoint = await env.theConnection.promises.prepare(geographyHelper.insertPointsSql)
    const points = env.geographyHelper.points
    const expected = env.geographyHelper.expectedPoints
    const promises = points.map(p => preparedPoint.promises.query([p]))
    await Promise.all(promises)
    const res = await env.theConnection.promises.query(geographyHelper.selectSql)
    assert.deepStrictEqual(res.first.length, points.length)
    assert.deepStrictEqual(res.first, expected)
    await preparedPoint.promises.free()
  })
})
