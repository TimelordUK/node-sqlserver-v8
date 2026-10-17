'use strict'

// the event contract: every scenario in scenarios.js must raise exactly the events its
// transcript in corpus/ lists, in that order. see corpus.js for the file format and
// capture.js for recording and comparing transcripts.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const path = require('path')
const assert = require('chai').assert
const { TestEnv } = require('../env/test-env')
const { scenarios } = require('./scenarios')
const { runIsolated } = require('./recorder')
const corpus = require('./corpus')

const root = path.join(path.dirname(require.resolve('./scenarios')), '../..')
const connectionString = new TestEnv().connectionString

describe('event contract', function () {
  this.timeout(40000)

  for (const scenario of scenarios) {
    it(scenario.name, async function handler () {
      const expected = corpus.read(scenario.name)
      assert.isNotNull(expected, `no transcript for ${scenario.name} - record one with: node test/contract/capture.js --update ${scenario.name}`)
      const lines = await runIsolated(root, connectionString, scenario)
      if (!corpus.matches(expected, lines)) {
        assert.fail(`${scenario.name} (${expected.status}) differs from ${path.basename(expected.file)}:\n${corpus.diff(expected.variants[0], lines)}`)
      }
    })
  }
})
