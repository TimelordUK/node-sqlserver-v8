# Release notes template

The GitHub release is created from this file automatically when the
`NPM Package Validation and Publish` workflow publishes (not on a dry run, which
shows a preview in the job summary instead). `.github/scripts/release-notes.js`
keeps everything below the line and fills the two `EDIT ME` sections: "What's
changed" from the PR titles merged since the previous tag (`feat:` / `fix:` /
`perf:`; chore, ci, test, docs and dependency bumps are left out), and
"Upgrading" from the workflow's `upgrading` input, dropping it when that is
empty. Preview locally with `node .github/scripts/release-notes.js --version X.Y.Z`.
Everything else is standing content that stays the same release to release.

Keep the per-release part at the top: that is the only bit a returning reader
needs. The standing sections are collapsed with `<details>` so the page stays
readable at a glance while the reference material is still one click away.

When something in the standing content stops being true — a new platform gets
a bundled binary, a minimum version moves — change it **here** as part of the
same PR, so the next release inherits the correction instead of repeating a
stale claim.

---

## What's changed

<!-- EDIT ME: 3-6 bullets, user-visible first. Lead with anything that changes
     how the package installs or what it supports, since that is what breaks
     people. Link PRs. Keep internal-only churn out of this list. -->

-

**Full Changelog**: https://github.com/TimelordUK/node-sqlserver-v8/compare/vPREV...vTHIS

## Upgrading

<!-- EDIT ME: delete this section if a plain `npm install` is all it takes.
     Otherwise say exactly what a consumer has to do differently. -->

```sh
npm install msnodesqlv8
```

---

## Known issue: some warnings are missing on Linux with unixODBC older than 2.3.12

Since **6.0.0**, warnings that SQL Server raises at the end of a result set
are delivered as `info` messages. Examples:

- 8153 "Null value is eliminated by an aggregate or other SET operation"
- 3606 arithmetic overflow
- 3607 division by zero

The ODBC driver hands these over on the fetch that finds no more rows. The
unixODBC driver manager before 2.3.12 discards them there, so they never reach
msnodesqlv8. Nothing errors and no rows are lost; those `info` messages just
don't appear. PRINT and `RAISERROR` messages are not affected. 2.3.9 is
confirmed affected and 2.3.12 confirmed fine.

This mostly hits **Ubuntu 22.04**, which ships 2.3.9; Microsoft's package repo
for 22.04 has only 2.3.7. Ubuntu 24.04 ships 2.3.12. Windows and macOS
(Homebrew) are not affected.

Check the version your app actually loads. An `odbcinst` from conda or
similar on your `PATH` can report a different one:

```sh
ldconfig -p | grep 'libodbc.so.2 '
dpkg -l | grep -E 'libodbc2|unixodbc '
```

To fix it, install unixODBC 2.3.12 or later. On Ubuntu 22.04 that means
building it into `/usr/local`, which the dynamic linker searches before the
system copy. No rebuild of msnodesqlv8 is needed: the prebuilt binary links
`libodbc.so.2`, the same library name.

```sh
sudo apt-get install -y build-essential
curl -LO https://www.unixodbc.org/unixODBC-2.3.12.tar.gz
tar xzf unixODBC-2.3.12.tar.gz && cd unixODBC-2.3.12
./configure --prefix=/usr/local --sysconfdir=/etc --disable-gui   # keeps using /etc/odbcinst.ini
make -j"$(nproc)" && sudo make install && sudo ldconfig
ldconfig -p | grep 'libodbc.so.2 '   # /usr/local/lib should now be listed first
```

To undo it, run `sudo make uninstall && sudo ldconfig` from the same
directory.

## New to msnodesqlv8? Start with the API tour

[**msnodesqlv8-api-tour**](https://github.com/TimelordUK/msnodesqlv8-api-tour)
is one file that walks through the whole API, one copyable section per area:
connections and parameters, streaming with pause / resume, multiple result
sets, prepared statements, stored procedures with output params, transactions,
the table manager's bulk insert / update / delete, BCP, TVPs, geography,
print and error handling, cancel and timeouts, and the connection pool. It
cleans up after itself, so it is safe to re-run and hack on.

```sh
git clone https://github.com/TimelordUK/msnodesqlv8-api-tour && cd msnodesqlv8-api-tour
npm install
CONNECTION_STRING="Driver={ODBC Driver 18 for SQL Server};Server=localhost,1433;Database=tempdb;UID=sa;PWD=...;TrustServerCertificate=yes;" node api-tour.js
```

## Prebuilt binaries ship inside the npm package

Since **5.5.0** the per-platform N-API binary is bundled in the published
package. There is **no download at install time** and no compile step on a
supported platform — `npm install` unpacks the right binary and that is the
whole install.

This means the package installs behind a corporate proxy, from an Artifactory
or Nexus mirror, on an airgapped host, and under `npm ci --ignore-scripts`.

```
node_modules/msnodesqlv8/prebuilds/
├── win32-x64/msnodesqlv8.node
├── darwin-arm64/msnodesqlv8.node
└── linux-x64/
    ├── msnodesqlv8.glibc.node
    └── msnodesqlv8.musl.node
```

The correct file is selected **at require time**, by platform, architecture and
libc — not pinned at install time. One binary per platform serves every Node
line *and* every Electron version, because the addon is pure N-API with no V8
ABI coupling.

| Platform | Bundled | Notes |
|---|---|---|
| Windows x64 | yes | |
| Linux x64 (glibc) | yes | built on Ubuntu 22.04, needs glibc 2.35+ |
| Linux x64 (musl) | yes | Alpine, built in `node:22-alpine` |
| macOS arm64 | yes | Apple Silicon |
| macOS x64 (Intel) | no | compiles from source on install |
| Linux arm64 | no | compiles from source on install |
| Windows arm64 | no | compiles from source on install |

Where there is no bundled binary the `install` script falls back to a
`node-gyp` source build, which needs a C++ toolchain and the unixODBC headers.

**Supported means: a Node line that upstream still supports, which CI tests on
every commit.** Currently Node 22, 24 and 26, and `engines` requires
`node >=22`. Node 18 (EOL 2025-04-30) and Node 20 (EOL 2026-04-30) are past
upstream end-of-life and are not tested.

**32-bit Windows (`ia32`) is not supported.** `cpu` is declared as
`["x64", "arm64"]`, so `npm install` refuses with `EBADPLATFORM` rather than
failing later at load. Note `win32` is Node's platform string for *all*
Windows including 64-bit, so "win32 unsupported" would be the wrong way to say
this.

Any Electron with N-API ≥ 8 works, with no `electron-rebuild` and no
Electron-specific artifact.

<details>
<summary><b>Installing without any network access</b></summary>

Because the binaries are plain files with predictable names, there are three
ways to place one, in increasing order of scope:

1. **Normal install** — `npm install msnodesqlv8`. Works with
   `--ignore-scripts`; nothing is fetched or built.
2. **Global install** — `npm install -g msnodesqlv8` now succeeds with no
   network fetch of a binary. Note that npm's global `node_modules` is not on
   Node's module resolution path, so a project still needs `NODE_PATH` set to
   `$(npm root -g)` to `require` it.
3. **Beside the node executable** — drop
   `prebuilds/<platform>-<arch>/msnodesqlv8.node` next to `node` itself and
   every project on that machine resolves it, with no per-project install.

</details>

<details>
<summary><b>Sample apps</b></summary>

| description | link |
|---|---|
| **start here**: the whole API in one runnable file | [msnodesqlv8-api-tour](https://github.com/TimelordUK/msnodesqlv8-api-tour) |
| next js example, note cant run driver on UI thread. | [todo-with-nextjs_msnodesqlv8](https://github.com/TimelordUK/todo-with-nextjs_msnodesqlv8) |
| next js example using app router, note cant run driver on UI thread. | [todo-with-nextjs-app-router_msnodesqlv8](https://github.com/TimelordUK/todo-with-nextjs-app-router_msnodesqlv8) |
| using vite + express | [msnodesqlv8-vite](https://github.com/TimelordUK/msnodesqlv8-vite) |
| using in typescript | [msnodesqlv8_ts_sample](https://github.com/TimelordUK/msnodesqlv8_ts_sample) |
| js example typings in IDE | [msnodesqlv8_yarn_sample](https://github.com/TimelordUK/msnodesqlv8_yarn_sample) |
| using sequelize | [msnodesqlv8-sequelize](https://github.com/TimelordUK/msnodesqlv8-sequelize) |
| using mssql | [msnodesqlv8_mssql_sample](https://github.com/TimelordUK/msnodesqlv8_mssql_sample) |
| using electron | [msnodesqlv8-electron](https://github.com/TimelordUK/msnodesqlv8-electron) |
| using react | [msnodesqlv8-react](https://github.com/TimelordUK/msnodesqlv8-react) |

</details>

<details>
<summary><b>Quick start</b></summary>

JavaScript:

```js
const sql = require('msnodesqlv8')

const connectionString = "Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;"
const query = 'SELECT top 2 * FROM syscolumns'

async function runner () {
  const res = await sql.promises.query(connectionString, query)
  console.log(JSON.stringify(res, null, 4))
}

runner().then(() => console.log('done.')).catch(e => console.error(e))
```

TypeScript:

```ts
import sql from 'msnodesqlv8'
import Connection = MsNodeSqlV8.Connection
import ConnectionPromises = MsNodeSqlV8.ConnectionPromises

async function t () {
  const connectionString = "Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;"
  const con: Connection = await sql.promises.open(connectionString)
  const promises: ConnectionPromises = con.promises
  const res = await promises.query('select @@servername as server')
  console.log(JSON.stringify(res, null, 4))
  await con.promises.close()
}

t().then(() => console.log('closed'))
```

</details>

<details>
<summary><b>Feature highlights</b></summary>

**Connection pool with transaction support.** Pull a connection out of the
pool, keep it busy for the life of a transaction, then commit or roll back and
release it:

```typescript
pool.beginTransaction(function (err, description) { /* description.connection.query() */ })
pool.commitTransaction(description, function (err) { /* IF (@@TRANCOUNT > 0) COMMIT TRANSACTION */ })
pool.rollbackTransaction(description, function (err) { /* IF (@@TRANCOUNT > 0) ROLLBACK TRANSACTION */ })
```

The same methods exist on the promised pool, plus a wrapper that commits on
success and rolls back on a thrown error:

```typescript
pool.promises.transaction(async function (description) {
  await description.connection.promises.query(`Do transaction query here`)
})
```

**Pool growth strategies.** `exponential` or `gradual`, so a burst of queries
does not immediately open connections up to the ceiling:

```js
const pool = new sql.Pool({
  connectionString,
  ceiling: 10,
  scalingStrategy: 'gradual',
  scalingIncrement: 3,
  scalingDelay: 0
})
```

**Detailed logging.** Switchable logging across both the JavaScript and C++
layers, to console or to a file, for seeing exactly what the driver is doing:

```js
const sql = require('msnodesqlv8')

sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)

// sql.logger.setLogFile('/var/log/myapp/sql-trace.log')
// sql.logger.configureForDevelopment()            // TRACE, console
// sql.logger.configureForProduction('/var/log/myapp')  // ERROR, file only
// sql.logger.configureForTesting()                // SILENT
// sql.logger.setLogLevel(sql.LogLevel.SILENT)     // default for production
```

</details>

<details>
<summary><b>Migrating from 4.x</b></summary>

The 4.x → 5.x step is a large change and should be tested carefully before a
production rollout.

1. The C++ layer moved from **nan to Node-API (N-API)**.
2. Extensive switchable logging was added, to see exactly what the driver is
   doing.
3. Building and testing moved to GitHub Actions.
4. Linux support requires **glibc 2.35+** (Ubuntu 22.04 or later). Earlier
   distributions must build the driver themselves.
5. As close to a drop-in replacement for 4.x as possible.
6. **32-bit Windows (`ia32`) is no longer supported**, and `npm install` now
   refuses it outright with `EBADPLATFORM`. 64-bit Windows is fully supported -
   Node calls it `win32` too, which the old wording made sound otherwise.
7. Windows, Linux and macOS are the supported platforms.
8. Alpine/musl was originally best-effort and out of scope. **As of 5.5.0 a
   musl binary is built, smoke tested in CI and shipped in the package.**

</details>
