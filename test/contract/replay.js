'use strict'

// runs corpus scenarios through the real JS layer over the fake native driver, replaying
// the native calls recorded for them (capture.js --native), and compares each transcript
// with the corpus. no server needed.
//
//   node test/contract/replay.js [filter...]

const fs = require('fs')
const path = require('path')
const { scenarios } = require('./scenarios')
const { runScenario } = require('./recorder')
const corpus = require('./corpus')
const { ReplayNative, fakeSql } = require('../common/fake-native')

const NATIVE_DIR = path.join(__dirname, 'native')

function nativeLog (name, platform = process.platform) {
  const file = path.join(NATIVE_DIR, `${name}.${platform}.json`)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

// { lines, violations, unconsumed } for one replayed run of the scenario
// options are passed to ReplayNative (e.g. delay)
async function replayScenario (scenario, recorded, options = {}) {
  const native = new ReplayNative(recorded.log, options)
  const lines = await runScenario(fakeSql(native), '<connection string>', scenario)
  return { lines, violations: native.violations, unconsumed: native.unconsumed() }
}

function replayable () {
  return scenarios.filter(s => nativeLog(s.name))
}

async function main () {
  const filters = process.argv.slice(2)
  const selected = replayable().filter(s => filters.length === 0 || filters.some(f => s.name.includes(f)))
  let same = 0
  let different = 0
  for (const scenario of selected) {
    const r = await replayScenario(scenario, nativeLog(scenario.name))
    const expected = corpus.read(scenario.name)
    const ok = corpus.matches(expected, r.lines) && r.violations.length === 0
    ok ? same++ : different++
    console.log(`${ok ? 'same' : 'DIFF'} ${scenario.name}`)
    if (!corpus.matches(expected, r.lines)) {
      console.log(corpus.diff(expected.variants[0], r.lines).split('\n').map(l => `    ${l}`).join('\n'))
    }
    for (const v of r.violations) console.log(`    ! ${v}`)
    if (r.unconsumed.length) console.log(`    (recorded calls never made: ${r.unconsumed.join(', ')})`)
  }
  console.log(`\n${same} same, ${different} different (${selected.length} with a native log for ${process.platform})`)
  process.exit(0)
}

if (require.main === module) main()

module.exports = { replayScenario, replayable, nativeLog }
