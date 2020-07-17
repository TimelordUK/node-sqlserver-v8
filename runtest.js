const Mocha = require('mocha')
const sql = require('./lib/sql.js')
const path = require('path')

runTest()

function runTest () {
  const argv = require('minimist')(process.argv.slice(2))
  console.log(argv)
  let connStr = null

  let toRun
  if (Object.prototype.hasOwnProperty.call(argv, 't')) {
    toRun = argv.t
  }

  if (Object.prototype.hasOwnProperty.call(argv, 'a')) {
    const appVeyorVersion = argv.a
    connStr = `Driver={SQL Server Native Client 11.0}; Server=(local)\\SQL${appVeyorVersion}; Database={master}; Uid=sa; Pwd=Password12!`
    console.log(`set connStr as ${connStr}`)
  }

  if (Object.prototype.hasOwnProperty.call(argv, 'l')) {
    connStr = 'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'
  }

  if (Object.prototype.hasOwnProperty.call(argv, 'u')) {
    connStr = ' Driver={SQL Server Native Client 17.0}; database=node; Server=192.168.56.1; UID=linux; PWD=linux'
  }

  //
  if (!Array.isArray(toRun)) {
    toRun = [toRun]
  }

  run(toRun, e => {
    console.log(e)
    process.exit(e)
  })

  function run (files, done) {
    const mocha = new Mocha(
      {
        ui: 'tdd'
      }
    )

    mocha.suite.on('pre-require', g => {
      g.native_sql = sql
      if (connStr) {
        console.log(`use conn_str ${connStr}`)
        g.conn_str = connStr
      }
    })

    mocha.suite.on('require', () => {
    })

    files.forEach(f => {
      const p = path.join('unit.tests', f)
      mocha.addFile(p)
    })

    mocha.run(failures => {
      process.on('uncaughtException', err => {
        console.log(err)
      })

      process.on('exit', () => {
        done(failures)
      })
    })
  }
}
