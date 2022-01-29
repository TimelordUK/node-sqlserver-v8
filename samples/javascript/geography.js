'use strict'

const path = require('path')
const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString

main().then(() => {
  console.log('done')
})

async function main () {
  try {
    const con = await sql.promises.open(connectionString)
    await asFunction((con))
    await con.promises.close()
  } catch (err) {
    if (err) {
      if (Array.isArray(err)) {
        err.forEach((e) => {
          console.log(e.message)
        })
      } else {
        console.log(err.message)
      }
    }
  }
}

function asTvpTable (table, allGeography) {
  allGeography.forEach(l => {
    // each row is represented as an array of columns
    table.rows[table.rows.length] = [l]
  })
  const tp = sql.TvpFromTable(table)
  return tp
}

async function asFunction (theConnection) {
  console.log('work with SQL server Geography using tvp')

  const geographyHelper = new GeographyHelper(theConnection)
  const coordinates = geographyHelper.getCoordinates()
  const allGeography = geographyHelper.all(coordinates)

  console.log('create table')

  const table = await geographyHelper.createGeographyTable()
  const procName = 'InsertGeographyTvp'

  const tp = asTvpTable(table, allGeography)
  table.rows = []
  console.log(`call proc ${procName} with tvp to bulk insert ${allGeography.length} rows`)
  await theConnection.promises.callProc(procName, [tp])
  console.log(`select all data '${geographyHelper.selectSql}'`)
  const res = await theConnection.promises.query(geographyHelper.selectSql)
  const json = JSON.stringify(res, null, 4)
  console.log(`json = ${json}`)
}

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
        console.log(`exec '${sql}' ....`)
        await theConnection.promises.query(sql)
        console.log('... done')
      }

      await exec(dropTableSql)
      await exec(createTableSql)
      await exec(dropProcedureSql)
      await exec(dropTypeSql)
      await exec(createType)
      await exec(createProcedureSql)
      const table = await theConnection.promises.getUserTypeTable(tableTypeName)
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
      const p = stem || '.'
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
