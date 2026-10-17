'use strict'

/* globals describe it */

// every corpus scenario with a recorded native log (test/contract/native) is replayed
// through the real JS layer over the fake driver (test/common/fake-native.js): its
// transcript must match the corpus, and the JS must respect the driver - no overlapping
// calls, nothing on a released statement, no call the recording does not have. no server
// is needed, and a race that the real driver shows once in ten runs fails every time.
//
// every recording runs on every platform (the JS layer is the same everywhere), compared
// with the corpus of the platform it was recorded on - so this runs on macOS too, where CI
// has no server.

const assert = require('assert')
const path = require('path')
const corpus = require('./corpus')
const { replayScenario, recordings } = require('./replay')
const { exploreScenario } = require('./explore')

describe('event contract, replayed over the fake driver', function () {
  this.timeout(30000)

  const all = recordings()
  it('has native recordings', () => {
    assert(all.length > 0, 'no recordings in test/contract/native')
  })

  for (const { scenario, platform, recorded, expected } of all) {
    it(`${scenario.name} (${platform})`, async () => {
      const r = await replayScenario(scenario, recorded)
      assert.deepStrictEqual(r.violations, [], `${scenario.name}: the JS did not respect the driver`)
      if (!corpus.matchesScenario(scenario, expected, r.lines)) {
        assert.fail(`${scenario.name} (${expected.status}) differs from ${path.basename(expected.file)}:\n${corpus.diff(expected.variants[0], r.lines)}`)
      }
    })
  }
})

// the same recordings with jittered timing, at fixed seeds so that a failure here can be
// replayed exactly: node test/contract/explore.js --seed <seed> --runs 1 <scenario>.
// the groups where timing matters most: pause, cancel and the queue.
describe('event contract, replayed over the fake driver with varied timing', function () {
  this.timeout(60000)
  const SEED = 1000
  const RUNS = 2
  const timingSensitive = recordings().filter(r => /^(pause|cancel|queue)\//.test(r.scenario.name))

  for (const { scenario, platform, recorded, expected } of timingSensitive) {
    it(`${scenario.name} (${platform}) holds over seeds ${SEED}..${SEED + RUNS - 1}`, async () => {
      const outcomes = await exploreScenario(scenario, { runs: RUNS, seed: SEED, recorded })
      for (const o of outcomes) {
        assert.deepStrictEqual(o.violations, [], `${scenario.name}, seed ${o.seeds[0]}: the JS did not respect the driver`)
        if (!corpus.matchesScenario(scenario, expected, o.lines)) {
          assert.fail(`${scenario.name}, seed ${o.seeds[0]}, differs from ${path.basename(expected.file)}:\n${corpus.diff(expected.variants[0], o.lines)}`)
        }
      }
    })
  }
})
