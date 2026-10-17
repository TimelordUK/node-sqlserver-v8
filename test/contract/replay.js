'use strict'

// runs corpus scenarios through the real JS layer over the fake native driver, replaying
// the native calls recorded for them (capture.js --native), and compares each transcript
// with the corpus. no server needed.
//
// a recording is replayed on any platform: it tests the JS layer, which is the same
// everywhere. what differs by platform is the driver, so a recording is compared with the
// corpus transcript of the platform it was recorded on.
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

function platformsRecorded () {
  const found = new Set()
  const walk = dir => {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else {
        const m = /\.([a-z0-9]+)\.json$/.exec(f)
        if (m) found.add(m[1])
      }
    }
  }
  walk(NATIVE_DIR)
  return [...found].sort()
}

// every recording: [{ scenario, platform, recorded, expected }], expected being the corpus
// transcript of the platform it was recorded on
function recordings () {
  const out = []
  for (const platform of platformsRecorded()) {
    for (const scenario of scenarios) {
      const recorded = nativeLog(scenario.name, platform)
      if (recorded) out.push({ scenario, platform, recorded, expected: corpus.read(scenario.name, platform) })
    }
  }
  return out
}

// { lines, violations, unconsumed } for one replayed run of the scenario
// options are passed to ReplayNative (e.g. delay)
async function replayScenario (scenario, recorded, options = {}) {
  const native = new ReplayNative(recorded.log, options)
  const lines = await runScenario(fakeSql(native), '<connection string>', scenario)
  return { lines, violations: native.violations, unconsumed: native.unconsumed() }
}

async function main () {
  const filters = process.argv.slice(2)
  const selected = recordings().filter(r => filters.length === 0 || filters.some(f => r.scenario.name.includes(f)))
  let same = 0
  let different = 0
  for (const { scenario, platform, recorded, expected } of selected) {
    const r = await replayScenario(scenario, recorded)
    const ok = corpus.matchesScenario(scenario, expected, r.lines) && r.violations.length === 0
    ok ? same++ : different++
    console.log(`${ok ? 'same' : 'DIFF'} ${scenario.name} (${platform})`)
    if (!corpus.matchesScenario(scenario, expected, r.lines)) {
      console.log(corpus.diff(expected.variants[0], r.lines).split('\n').map(l => `    ${l}`).join('\n'))
    }
    for (const v of r.violations) console.log(`    ! ${v}`)
    if (r.unconsumed.length) console.log(`    (recorded calls never made: ${r.unconsumed.join(', ')})`)
  }
  console.log(`\n${same} same, ${different} different (${selected.length} recordings: ${platformsRecorded().join(', ')})`)
  process.exit(0)
}

if (require.main === module) main()

module.exports = { replayScenario, recordings, nativeLog }
