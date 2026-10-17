'use strict'

// runs corpus scenarios and shows how each one compares with its expected transcript.
//
//   node test/contract/capture.js [filter...]          compare, print differences
//   node test/contract/capture.js --update [filter]    write what happens now into the corpus
//   node test/contract/capture.js --print [filter]     print each transcript in full
//   node test/contract/capture.js --repeat 10 [filter] run each scenario 10 times (default 3)
//   node test/contract/capture.js --root <dir>         use the msnodesqlv8 in <dir>, e.g. an
//                                                      older release, to see how it differs
//   node test/contract/capture.js --native [filter]    also record each scenario's native calls
//                                                      into native/<name>.json, for the fake
//                                                      driver to replay (a run whose transcript
//                                                      is not in the corpus is not kept)
//
// a filter matches any part of a scenario name, e.g. 'cancel/' or 'dup-key'.
// the connection string comes from the test environment, as for the mocha tests.

const fs = require('fs')
const path = require('path')
const { TestEnv } = require('../env/test-env')
const { scenarios } = require('./scenarios')
const { captureScenario, runIsolated } = require('./recorder')
const corpus = require('./corpus')

function parseArgs (argv) {
  const opts = { update: false, print: false, native: false, repeat: 3, root: path.join(__dirname, '../..'), filters: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--update') opts.update = true
    else if (a === '--print') opts.print = true
    else if (a === '--native') opts.native = true
    else if (a === '--repeat') opts.repeat = Number(argv[++i])
    else if (a === '--root') opts.root = path.resolve(argv[++i])
    else opts.filters.push(a)
  }
  return opts
}

async function main () {
  const opts = parseArgs(process.argv.slice(2))
  const version = require(path.join(opts.root, 'package.json')).version
  const connectionString = new TestEnv().connectionString
  const selected = scenarios.filter(s => opts.filters.length === 0 || opts.filters.some(f => s.name.includes(f)))
  console.log(`msnodesqlv8 ${version} (${opts.root}) - ${selected.length} scenarios, ${opts.repeat} runs each`)

  const summary = { same: 0, different: 0, missing: 0, nondeterministic: [] }
  for (const scenario of selected) {
    const variants = await captureScenario(opts.root, connectionString, scenario, opts.repeat)
    const expected = corpus.read(scenario.name)
    if (variants.length > 1) summary.nondeterministic.push(`${scenario.name} (${variants.map(v => v.count).join('/')})`)
    const allMatch = expected && variants.every(v => corpus.matchesScenario(scenario, expected, v.lines))
    const mark = !expected ? 'NEW ' : allMatch ? 'same' : 'DIFF'
    if (!expected) summary.missing++
    else if (allMatch) summary.same++
    else summary.different++
    console.log(`${mark} ${scenario.name}${variants.length > 1 ? `  [${variants.length} different outcomes]` : ''}${expected ? `  (${expected.status})` : ''}`)

    if (opts.print || (expected && !allMatch && !opts.update)) {
      for (const v of variants) {
        const indent = s => s.split('\n').map(l => `    ${l}`).join('\n')
        console.log(`  -- seen ${v.count}x`)
        if (expected && !corpus.matchesScenario(scenario, expected, v.lines)) console.log(indent(corpus.diff(expected.variants[0], v.lines)))
        else console.log(indent(v.lines.join('\n')))
      }
    }
    if (opts.update && !allMatch) {
      console.log(`  wrote ${path.relative(process.cwd(), corpus.write(scenario, variants))}`)
    }
    if (opts.native) await recordNative(opts.root, connectionString, scenario)
  }

  console.log(`\n${summary.same} same, ${summary.different} different, ${summary.missing} new`)
  if (summary.nondeterministic.length > 0) {
    console.log(`not deterministic (runs per outcome):\n  ${summary.nondeterministic.join('\n  ')}`)
  }
  // a hung query can leave native work outstanding, so don't wait for the event loop
  process.exit(0)
}

// one more run, recording its native calls; kept only if its transcript is in the corpus
async function recordNative (root, connectionString, scenario) {
  const file = nativeFile(scenario.name)
  const tmp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const lines = await runIsolated(root, connectionString, scenario, tmp)
  const expected = corpus.read(scenario.name)
  if (fs.existsSync(tmp) && expected && corpus.matchesScenario(scenario, expected, lines)) {
    fs.renameSync(tmp, file)
    console.log(`  native log ${path.relative(process.cwd(), file)}`)
  } else {
    fs.rmSync(tmp, { force: true })
    console.log('  native log not kept: that run does not match the corpus')
  }
}

function nativeFile (name, platform = process.platform) {
  return path.join(__dirname, 'native', `${name}.${platform}.json`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
