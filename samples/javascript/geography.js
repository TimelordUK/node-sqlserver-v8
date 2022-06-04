'use strict'

const sql = require('msnodesqlv8')
const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()

main().then(() => {
  console.log('done')
})

async function main () {
  try {
    await env.open()
    const con = env.theConnection
    await asFunction((con))
    await env.close()
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
  return sql.TvpFromTable(table)
}

async function asFunction (theConnection) {
  console.log('work with SQL server Geography using tvp')

  const geographyHelper = env.geographyHelper
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
