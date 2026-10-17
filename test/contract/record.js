'use strict'

// records a tester script into the event contract corpus:
//
//   npm run record-corpus -- <tester.js> [--name <name>] [--repeat 3] [--force]
//
// 1. copies the script to scripts/<name>.js (name: the file's own name), so its source is
//    kept beside what it recorded - it is then the scenario scripts/<name>
// 2. runs it --repeat times, each in its own process, and reports whether it is
//    deterministic
// 3. writes corpus/scripts/<name>.txt and its native recording, native/scripts/<name>.<platform>.json,
//    which replay.test.js and explore.js then pick up
//
// a script already in scripts/ is recorded again in place. see scripts/README.md for how
// to write one.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const SCRIPTS_DIR = path.join(__dirname, 'scripts')

function parseArgs (argv) {
  const opts = { file: null, name: null, repeat: 3, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') opts.name = argv[++i]
    else if (a === '--repeat') opts.repeat = Number(argv[++i])
    else if (a === '--force') opts.force = true
    else opts.file = a
  }
  return opts
}

function main () {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.file) {
    console.error('usage: npm run record-corpus -- <tester.js> [--name <name>] [--repeat 3] [--force]')
    process.exit(2)
  }
  const source = path.resolve(opts.file)
  if (!fs.existsSync(source)) {
    console.error(`no such file ${source}`)
    process.exit(2)
  }
  const name = opts.name ?? path.basename(source, '.js')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error(`'${name}' is not a usable scenario name: lower case letters, digits and '-' (use --name)`)
    process.exit(2)
  }
  const target = path.join(SCRIPTS_DIR, `${name}.js`)
  if (path.resolve(target) !== source) {
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== fs.readFileSync(source, 'utf8') && !opts.force) {
      console.error(`${path.relative(process.cwd(), target)} exists and differs; --force to replace it`)
      process.exit(2)
    }
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true })
    fs.copyFileSync(source, target)
    console.log(`copied to ${path.relative(process.cwd(), target)}`)
  }
  // the scenario list is read afresh by capture.js, so the new script is in it
  execFileSync(process.execPath, [path.join(__dirname, 'capture.js'), '--update', '--native', '--exact', '--repeat', String(opts.repeat), `scripts/${name}`], { stdio: 'inherit' })
  console.log(`\nreview corpus/scripts/${name}.txt: it pins what happens now (status: unreviewed).`)
  console.log('edit it to what the contract should be and mark it agreed - the tests then hold the driver to it.')
}

main()
