// Build the GitHub release body for a version from .github/RELEASE_TEMPLATE.md.
//
// The template's standing content (everything below its first `---` line) is
// kept as is. The two per-release sections are filled in here:
// - "What's changed" from the squash merged PRs since the previous tag, taken
//   from first parent commit subjects, which are the PR titles ending "(#123)".
//   Grouped by conventional commit prefix; chore / ci / build / test / docs /
//   style / refactor and dependency bumps are left out, as the template asks.
// - "Upgrading" is dropped unless upgrade notes are given.
//
//   node .github/scripts/release-notes.js --version 5.5.2 [--previous v5.5.1]
//     [--upgrading "text"] [--out notes.md]
//
// Needs the tags in the checkout (actions/checkout with fetch-depth: 0).

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const repoUrl = 'https://github.com/TimelordUK/node-sqlserver-v8'

function flag (name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback
}

function git (...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const version = flag('--version', require(path.join(root, 'package.json')).version)
const thisTag = `v${version}`
const upgrading = (flag('--upgrading', '') || '').trim()
const out = flag('--out', null)

// the newest v* tag behind HEAD that is not this release's own tag, so a re-run
// after the tag exists still compares against the release before it.
function previousTag () {
  const given = flag('--previous', null)
  if (given) return given
  const tags = git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-v:refname')
    .split('\n').filter(t => t && t !== thisTag)
  if (!tags.length) throw new Error('no previous v* tag found - pass --previous')
  return tags[0]
}

const groups = [
  { title: 'Features', types: ['feat'] },
  { title: 'Fixes', types: ['fix'] },
  { title: 'Performance', types: ['perf'] }
]
const skipped = ['chore', 'ci', 'build', 'test', 'docs', 'style', 'refactor', 'revert']

function changes (prev) {
  const subjects = git('log', '--first-parent', '--format=%s', `${prev}..HEAD`).split('\n').filter(Boolean)
  const byGroup = new Map(groups.map(g => [g.title, []]))
  const other = []
  for (const subject of subjects) {
    const m = subject.match(/^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/)
    const type = m ? m[1].toLowerCase() : null
    if (type && skipped.includes(type)) continue
    if (/\bbump\b/i.test(subject) && /\bdeps?\b|dependabot/i.test(subject)) continue
    // a version bump commit, e.g. "5.5.2"
    if (/^v?\d+\.\d+\.\d+$/.test(subject)) continue
    const text = (m ? m[4] : subject).replace(/\(#(\d+)\)\s*$/, `([#$1](${repoUrl}/pull/$1))`)
    const breaking = m && m[3] ? '**Breaking:** ' : ''
    const group = groups.find(g => g.types.includes(type))
    ;(group ? byGroup.get(group.title) : other).push(`- ${breaking}${text}`)
  }
  const sections = []
  for (const g of groups) {
    const lines = byGroup.get(g.title)
    if (lines.length) sections.push(`### ${g.title}\n\n${lines.join('\n')}`)
  }
  if (other.length) sections.push(`### Other\n\n${other.join('\n')}`)
  return sections.length ? sections.join('\n\n') : '- Maintenance release: dependency and build updates only.'
}

function render () {
  const prev = previousTag()
  const template = fs.readFileSync(path.join(root, '.github', 'RELEASE_TEMPLATE.md'), 'utf8')
  // drop the instructions above the first horizontal rule
  const cut = template.search(/^---\s*$/m)
  if (cut < 0) throw new Error('RELEASE_TEMPLATE.md has no --- line separating the instructions')
  let body = template.slice(cut).replace(/^---\s*\n+/, '')

  body = body.replace(/(## What's changed\s*\n)[\s\S]*?(\*\*Full Changelog\*\*)/,
    (_, head, tail) => `${head}\n${changes(prev)}\n\n${tail}`)
  body = body.replace(/vPREV\.\.\.vTHIS/g, `${prev}...${thisTag}`)

  // the Upgrading section runs up to the next horizontal rule
  body = body.replace(/## Upgrading\s*\n[\s\S]*?(?=^---\s*$)/m,
    upgrading ? `## Upgrading\n\n${upgrading}\n\n` : '')
  // any remaining EDIT ME comments are for the person editing, not the reader
  body = body.replace(/<!--[\s\S]*?-->\s*\n?/g, '')
  return body.replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

const notes = render()
if (out) {
  fs.writeFileSync(out, notes)
  console.error(`wrote ${out}`)
} else {
  process.stdout.write(notes)
}
