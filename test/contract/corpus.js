'use strict'

// reads and writes the expected transcripts in corpus/.
//
// a corpus file is the scenario as '#' comment lines (for whoever reads it - they are
// not compared), then the transcript. a scenario that is allowed more than one outcome
// lists each one, separated by a line '--- or'. that should be rare: an outcome that
// depends on timing is usually something to fix, not to accept.
//
//   # status: unreviewed | agreed
//
// 'unreviewed' is what capture.js writes: the transcript is what the driver does today,
// pinned so that a change shows up. 'agreed' means the transcript has been read and is
// the contract. to change the contract, edit the transcript and mark it agreed - the
// test then fails until the driver does what it says.
//
// a driver or platform that legitimately differs can have its own file,
// <name>.<platform>.txt (e.g. errors/dup-key-d.events.direct.linux.txt), which is used
// instead of <name>.txt on that platform.

const fs = require('fs')
const path = require('path')

const CORPUS_DIR = path.join(__dirname, 'corpus')
const ALTERNATIVE = '--- or'

function fileFor (name, platform = process.platform) {
  const specific = path.join(CORPUS_DIR, `${name}.${platform}.txt`)
  if (fs.existsSync(specific)) return specific
  return path.join(CORPUS_DIR, `${name}.txt`)
}

function read (name) {
  const file = fileFor(name)
  if (!fs.existsSync(file)) return null
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const status = /^# status: (\S+)/m.exec(text)?.[1] ?? 'unreviewed'
  const variants = [[]]
  for (const line of text.split('\n')) {
    if (line === ALTERNATIVE) variants.push([])
    else if (line !== '' && !line.startsWith('#')) variants[variants.length - 1].push(line)
  }
  return { file, status, variants }
}

function header (scenario, status) {
  const lines = [`# scenario: ${scenario.name}`, `# status: ${status}`]
  for (const statement of scenario.setup ?? []) lines.push(`# setup: ${statement}`)
  lines.push(`# sql: ${scenario.sql}`)
  if (scenario.params) lines.push(`# params: ${JSON.stringify(scenario.params, (k, v) => typeof v === 'number' && !isFinite(v) ? String(v) : v)}`)
  if (scenario.at) lines.push(`# at: ${JSON.stringify(scenario.at)}`)
  for (const f of scenario.followUps ?? []) {
    lines.push(`# follow-up ${f.label} on ${f.when ?? 'start'}: ${f.sql}${f.at ? ` at ${JSON.stringify(f.at)}` : ''}`)
  }
  return lines
}

// variants: [{ lines, count }] as captureScenario returns them
function write (scenario, variants) {
  const existing = read(scenario.name)
  const file = existing?.file ?? fileFor(scenario.name)
  const out = header(scenario, existing?.status ?? 'unreviewed')
  if (variants.length > 1) {
    out.push(`# NOT DETERMINISTIC: ${variants.length} different transcripts in ${variants.reduce((n, v) => n + v.count, 0)} runs`)
  }
  variants.forEach((v, i) => {
    if (i > 0) out.push(ALTERNATIVE)
    out.push(...v.lines)
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, out.join('\n') + '\n')
  return file
}

function matches (expected, lines) {
  const text = lines.join('\n')
  return expected.variants.some(v => v.join('\n') === text)
}

// a minimal line diff (longest common subsequence) - transcripts are short
function diff (expected, actual) {
  const n = expected.length
  const m = actual.length
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = expected[i] === actual[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && expected[i] === actual[j]) {
      out.push(`  ${expected[i]}`); i++; j++
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push(`+ ${actual[j]}`); j++
    } else {
      out.push(`- ${expected[i]}`); i++
    }
  }
  return out.join('\n')
}

module.exports = { read, write, matches, diff, CORPUS_DIR }
