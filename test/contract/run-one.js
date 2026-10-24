'use strict'

// runs one scenario in this process and writes its transcript to stdout as JSON.
// recorder.js starts this as a child process for every run, so that a query that
// hangs, floods events or leaves native work behind cannot affect the next run.
//   node run-one.js <msnodesqlv8 root> <scenario name>     (connection string in MSSQL_CONTRACT_CS)
// with MSSQL_CONTRACT_NATIVE=<file>, the native calls and results are also recorded there
// (see native-tap.js), for test/common/fake-native.js to replay.

const fs = require('fs')
const path = require('path')
const { scenarios } = require('./scenarios')
const { runScenario } = require('./recorder')

const [root, name] = process.argv.slice(2)
const scenario = scenarios.find(s => s.name === name)
if (!scenario) {
  console.error(`no scenario ${name}`)
  process.exit(2)
}

const nativeFile = process.env.MSSQL_CONTRACT_NATIVE
let tap = null
if (nativeFile) {
  const { utilModule } = require(path.join(root, 'lib/util'))
  // a script may log column values on any query, so its rows are kept whole
  tap = require('./native-tap').install(new utilModule.Native().cppDriver, { keepData: !!(scenario.columns || scenario.script) })
}

runScenario(require(root), process.env.MSSQL_CONTRACT_CS, scenario)
  .then(lines => {
    if (tap) fs.writeFileSync(nativeFile, JSON.stringify({ scenario: scenario.name, transcript: lines, log: tap.log }))
    process.stdout.write(JSON.stringify(lines), () => process.exit(0))
  })
  .catch(e => {
    process.stdout.write(JSON.stringify([`EXCEPTION ${e.message}`]), () => process.exit(0))
  })
