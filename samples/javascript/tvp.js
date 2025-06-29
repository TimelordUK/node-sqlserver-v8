'use strict'

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()

main().then(() => {
  console.log('done')
})

async function main () {
  try {
    await env.open()
    await asFunction(env.theConnection)
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

async function asFunction (theConnection) {
  console.log('work with tvp type to bulk insert')

  const tableName = 'TestTvp'
  const helper = env.tvpHelper(tableName)
  const vec = helper.getExtendedVec(10)
  const table = await helper.create()
  table.addRowsFromObjects(vec)
  const tp = env.sql.TvpFromTable(table)
  table.rows = []
  const execSql = 'exec insertTestTvp @tvp = ?;'
  console.log(`exec ${execSql}`)
  await theConnection.promises.query(execSql, [tp])
  const selectSql = `select * from ${tableName}`
  console.log(`select results ${selectSql}`)
  const res = await theConnection.promises.query(selectSql)
  const json = JSON.stringify(res, null, 4)
  console.log(`json = ${json}`)
}
