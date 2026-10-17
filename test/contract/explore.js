'use strict'

// replays each recorded scenario many times over the fake driver, holding each native
// state or result back for a random few ms, so the scenario's own timers (a resume after
// 1 ms, a cancel after 300 ms) and the JS layer's own steps land at different points
// against the driver's results. what the driver sends is always what it sent; only the
// timing moves. a contract has to hold whatever the timing, so every run must match the
// corpus with no violations.
//
//   node test/contract/explore.js [--runs 20] [--seed 1] [--scale 1] [filter...]
//   --scale multiplies the delays (0-8 ms), e.g. so a 100 ms resume lands mid-fetch
//
// a failing run prints its seed; --seed <n> --runs 1 replays exactly that timing.

const { recordings, nativeLog, replayScenario } = require('./replay')
const corpus = require('./corpus')

const DELAYS = [0, 0, 0, 0, 1, 2, 5, 8]

// mulberry32: small, seedable
function random (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// each result held for as long as the driver took, give or take a fifth, plus a few ms
function delays (seed, scale = 1) {
  const r = random(seed)
  return (e, recorded) => recorded * (0.8 + 0.4 * r()) + DELAYS[Math.floor(r() * DELAYS.length)] * scale
}

// every distinct outcome of runs of the scenario: [{ lines, violations, seeds }]
// recorded: the native log to replay (default: the one recorded on this platform)
async function exploreScenario (scenario, { runs = 20, seed = 1, scale = 1, recorded = nativeLog(scenario.name) } = {}) {
  const outcomes = new Map()
  for (let i = 0; i < runs; i++) {
    const s = seed + i
    const r = await replayScenario(scenario, recorded, { delay: delays(s, scale), stallMs: 1000 + 8 * scale })
    const key = JSON.stringify([r.lines, r.violations])
    if (!outcomes.has(key)) outcomes.set(key, { lines: r.lines, violations: r.violations, seeds: [] })
    outcomes.get(key).seeds.push(s)
  }
  return [...outcomes.values()].sort((a, b) => b.seeds.length - a.seeds.length)
}

async function main () {
  const args = process.argv.slice(2)
  const opts = { runs: 20, seed: 1, scale: 1 }
  const filters = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs') opts.runs = Number(args[++i])
    else if (args[i] === '--seed') opts.seed = Number(args[++i])
    else if (args[i] === '--scale') opts.scale = Number(args[++i])
    else filters.push(args[i])
  }
  const selected = recordings().filter(r => filters.length === 0 || filters.some(f => r.scenario.name.includes(f)))
  console.log(`${selected.length} recordings, ${opts.runs} runs each, seeds ${opts.seed}..${opts.seed + opts.runs - 1}, delays x${opts.scale}`)
  let held = 0
  let broke = 0
  for (const { scenario, platform, recorded, expected } of selected) {
    const outcomes = await exploreScenario(scenario, { ...opts, recorded })
    const bad = outcomes.filter(o => o.violations.length > 0 || !corpus.matchesScenario(scenario, expected, o.lines))
    if (bad.length === 0) {
      held++
      continue
    }
    broke++
    console.log(`BROKE ${scenario.name} (${platform})  (${outcomes.length} outcomes)`)
    for (const o of bad) {
      console.log(`  -- ${o.seeds.length}/${opts.runs} runs, e.g. --seed ${o.seeds[0]} --runs 1`)
      for (const v of o.violations) console.log(`    ! ${v}`)
      if (!corpus.matchesScenario(scenario, expected, o.lines)) {
        const diff = corpus.diff(expected.variants[0], o.lines).split('\n')
          .filter(l => !/^ {2}(row|q\d: row)( x\d+)?$/.test(l))
        console.log(diff.map(l => `    ${l}`).join('\n'))
      }
    }
  }
  console.log(`\n${held} held under every timing, ${broke} broke`)
  process.exit(0)
}

if (require.main === module) main()

module.exports = { exploreScenario }
