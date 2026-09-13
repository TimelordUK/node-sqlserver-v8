#!/usr/bin/env node
'use strict'

// Fetch the published prebuilt binary into this working tree, so you can work on
// the JavaScript without a C++ toolchain.
//
// Why this exists: a fresh clone tracks neither prebuilds/ nor build/, and the
// install script is node-gyp-build, which compiles from source when it finds no
// binary. Before 5.5.0 a dev install pulled a binary down via prebuild-install as
// a side effect; that is gone, and GitHub releases no longer carry per-platform
// tarballs either. The binary now lives inside the published npm package, so that
// is where this takes it from.
//
//   npm run fetch-prebuild            # latest published version
//   npm run fetch-prebuild -- 5.5.0   # a specific version
//
// node-gyp-build resolves build/Release, then build/Debug, then prebuilds/. So a
// binary placed here is used only while you have not built from source - compile
// later and your own build wins automatically, with nothing to undo.
//
// This talks to the registry over https and extracts with the system tar rather
// than shelling out to npm: on Windows, spawning npm.cmd from Node fails with
// EINVAL unless a shell is used (a consequence of the CVE-2024-27980 fix), and
// tar.exe ships in System32 so it is available without Git Bash.

const { execFileSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const pkg = require(path.join(repoRoot, 'package.json'))
const requested = process.argv[2] || 'latest'
const REGISTRY = 'https://registry.npmjs.org'

function get (url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'msnodesqlv8-fetch-prebuild' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return get(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main () {
  // Cache-Control: no-cache because the packument is CDN cached and can lag a
  // publish by minutes - worth avoiding a confusing "latest is the old version".
  const doc = JSON.parse(await get(`${REGISTRY}/${pkg.name}`))
  const version = requested === 'latest' ? doc['dist-tags'].latest : requested
  const meta = doc.versions[version]
  if (!meta) {
    throw new Error(`${pkg.name}@${version} not found on the registry`)
  }

  console.log(`local package.json: ${pkg.version}`)
  console.log(`fetching binary from: ${pkg.name}@${version}`)
  if (version !== pkg.version) {
    console.log(`note: ${version} does not match your working tree (${pkg.version}). That is fine for JavaScript work.`)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msnodesqlv8-prebuild-'))
  try {
    fs.writeFileSync(path.join(tmp, 'pkg.tgz'), await get(meta.dist.tarball))

    // Run tar with cwd set and a bare filename, never an absolute path: GNU tar
    // reads "D:\..." as a remote host:path and fails with "Cannot connect to D:".
    // Relative names keep both GNU tar and the bsdtar in System32 happy.
    // tar is an executable, not a .cmd, so execFileSync is safe here.
    execFileSync('tar', ['-xzf', 'pkg.tgz'], { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] })

    const src = path.join(tmp, 'package', 'prebuilds')
    if (!fs.existsSync(src)) {
      throw new Error(
        `${pkg.name}@${version} contains no prebuilds/ directory. ` +
        'Versions before 5.5.0 did not bundle binaries - use 5.5.0 or later.'
      )
    }

    const dest = path.join(repoRoot, 'prebuilds')
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })

    const found = []
    for (const dir of fs.readdirSync(dest)) {
      for (const file of fs.readdirSync(path.join(dest, dir))) {
        found.push(`${dir}/${file}`)
      }
    }
    console.log(`\nwrote prebuilds/ (${found.length} binaries):`)
    for (const f of found) console.log(`  ${f}`)

    // Prove the binary for THIS platform resolves and loads, rather than
    // reporting success on the basis of having copied some files.
    const resolvedPath = require('node-gyp-build').path(repoRoot)
    const rel = path.relative(repoRoot, resolvedPath).replace(/\\/g, '/')
    console.log(`\nnode-gyp-build resolves: ${rel}`)
    if (!rel.startsWith('prebuilds/')) {
      console.log('note: an existing build/ directory takes precedence, as intended.')
    }

    const sql = require(path.join(repoRoot, 'lib', 'sql.js'))
    const exported = Object.keys(sql).length
    console.log(`loaded ok, exports: ${exported}`)
    if (exported === 0) throw new Error('module loaded but exported nothing')

    console.log('\nReady - you can work on lib/ without a C++ toolchain.')
    console.log(`If cpp/ has moved on since ${version}, build from source instead: npm run rebuild`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch(e => {
  console.error(`\nfailed: ${e.message}`)
  process.exit(1)
})
