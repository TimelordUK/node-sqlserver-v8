'use strict'

// runs one scenario in this process and writes its transcript to stdout as JSON.
// recorder.js starts this as a child process for every run, so that a query that
// hangs, floods events or leaves native work behind cannot affect the next run.
//   node run-one.js <msnodesqlv8 root> <scenario name>     (connection string in MSSQL_CONTRACT_CS)

const { scenarios } = require('./scenarios')
const { runScenario } = require('./recorder')

const [root, name] = process.argv.slice(2)
const scenario = scenarios.find(s => s.name === name)
if (!scenario) {
  console.error(`no scenario ${name}`)
  process.exit(2)
}

runScenario(require(root), process.env.MSSQL_CONTRACT_CS, scenario)
  .then(lines => {
    process.stdout.write(JSON.stringify(lines), () => process.exit(0))
  })
  .catch(e => {
    process.stdout.write(JSON.stringify([`EXCEPTION ${e.message}`]), () => process.exit(0))
  })
