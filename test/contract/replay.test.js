'use strict'

/* globals describe it */

// every corpus scenario with a recorded native log (test/contract/native) is replayed
// through the real JS layer over the fake driver (test/common/fake-native.js): its
// transcript must match the corpus, and the JS must respect the driver - no overlapping
// calls, nothing on a released statement, no call the recording does not have. no server
// is needed, and a race that the real driver shows once in ten runs fails every time.

const assert = require('assert')
const path = require('path')
const corpus = require('./corpus')
const { replayScenario, replayable, nativeLog } = require('./replay')

describe('event contract, replayed over the fake driver', function () {
  this.timeout(20000)

  const scenarios = replayable()
  it(`has native logs for ${process.platform}`, function () {
    if (scenarios.length === 0) this.skip()
  })

  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      const r = await replayScenario(scenario, nativeLog(scenario.name))
      const expected = corpus.read(scenario.name)
      assert.deepStrictEqual(r.violations, [], `${scenario.name}: the JS did not respect the driver`)
      if (!corpus.matches(expected, r.lines)) {
        assert.fail(`${scenario.name} (${expected.status}) differs from ${path.basename(expected.file)}:\n${corpus.diff(expected.variants[0], r.lines)}`)
      }
    })
  }
})
