const Mocha = require('mocha')
const sql = require('./lib/sql.js')
const path = require('path')

runTest()

function getConnection (jsonFile, key) {
  const config = require(path.join(__dirname, jsonFile))
  return config.connection[key]
}

function argvGet (argv, key) {
  if (Object.prototype.hasOwnProperty.call(argv, key)) {
    return argv[key] || true
  }
  return null
}

function resolve (argv) {
  let connStr = ''
  const jsonFile = argvGet(argv, 'json') || 'runtest.json'
  const key = argvGet(argv, 'k')
  if (key) {
    connStr = getConnection(jsonFile, key)
  } else if (Object.prototype.hasOwnProperty.call(argv, 'a')) {
    const appVeyorVersion = argv.a
    connStr = `Driver={ODBC Driver 17 for SQL Server}; Server=(local)\\SQL${appVeyorVersion}; Database={master}; Uid=sa; Pwd=Password12!`
    console.log(`set connStr as ${connStr}`)
  } else if (Object.prototype.hasOwnProperty.call(argv, 'l')) {
    connStr = 'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'
  } else if (Object.prototype.hasOwnProperty.call(argv, 'u')) {
    connStr = 'Driver={ODBC Driver 17 for SQL Server}; database=node; Server=192.168.56.1; UID=linux; PWD=linux'
  } else if (Object.prototype.hasOwnProperty.call(argv, 'x')) {
    connStr = 'Driver={ODBC Driver 17 for SQL Server}; Server=localhost; Uid=SA; Pwd=Password12!'
  }
  return connStr
}

function runTest () {
  const argv = require('minimist')(process.argv.slice(2))
  console.log(argv)
  const connStr = resolve(argv)
  let toRun = argvGet(argv, 't')

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

    let shown = false
    mocha.suite.on('pre-require', g => {
      g.native_sql = sql
      if (connStr) {
        g.conn_str = connStr
        if (shown) return
        console.log(`use conn_str ${connStr}`)
        shown = true
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
