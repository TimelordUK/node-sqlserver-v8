// Reproduces issue #396:
// PRINT followed by THROW swallows the THROW message and surfaces
// 'Associated statement is not prepared' (HY007) instead.
//
// Run with the test env file so we pick up the same connection string
// the mocha tests use:
//   npx env-cmd -e test node samples/javascript/issue-396-print-throw.js

const { TestEnv } = require('../../test/env/test-env')

const env = new TestEnv()

function runQuery (con, label, sqlText) {
  return new Promise((resolve) => {
    con.query(sqlText, (err) => {
      console.log(`--- ${label} ---`)
      console.log('SQL :', sqlText)
      if (err) {
        console.log('ERR :', err.message)
        console.log('     sqlstate=', err.sqlstate, 'code=', err.code)
      } else {
        console.log('OK  : no error')
      }
      resolve()
    })
  })
}

async function main () {
  await env.open()
  const con = env.theConnection
  try {
    // Baseline: bare THROW surfaces correctly
    await runQuery(con, 'Q1: bare THROW', "THROW 50001, 'BOOM', 1")

    // Bug: PRINT before THROW causes THROW message to be swallowed
    await runQuery(con, 'Q2: PRINT + THROW', "PRINT 'BAR' ; THROW 50000, 'BOOM BOOM', 1")

    // Variations to map the surface area
    await runQuery(con, 'Q3: SELECT + THROW', "SELECT 1 AS x ; THROW 50002, 'BOOM3', 1")
    await runQuery(con, 'Q4: RAISERROR after PRINT',
      "PRINT 'BAR' ; RAISERROR('BOOM4', 16, 1)")
  } finally {
    await env.close()
  }
}

main().then(() => {
  console.log('done')
}).catch((e) => {
  console.error('main failed', e)
  process.exit(1)
})
