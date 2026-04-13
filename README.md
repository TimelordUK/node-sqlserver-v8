# msnodesqlv8

[![Build status](https://github.com/TimelordUK/node-sqlserver-v8/actions/workflows/test.yml/badge.svg)](https://github.com/TimelordUK/node-sqlserver-v8/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/dm/msnodesqlv8.svg)](https://www.npmjs.com/package/msnodesqlv8)
[![GitHub stars](https://img.shields.io/github/stars/TimelordUK/node-sqlserver-v8.svg)](https://github.com/TimelordUK/node-sqlserver-v8/stargazers)

Native ODBC driver for SQL Server (and Sybase ASE) for Node.js and Electron. Ships prebuilt binaries for Linux, macOS and Windows. Supports BCP, TVP, streaming, Always Encrypted, stored procedures, prepared statements, connection pooling and Windows integrated auth.

---

## Performance

Measured end-to-end over a network (RTT ~3 ms) against SQL Server 2022 on Linux x64, Node v24, ODBC Driver 18. Schema is a 14-column trade record (bigint PK, datetime2, varchar, nvarchar, int, decimal, bit, nullable nvarchar) — a realistic OLTP row, not a narrow best-case table.

| Operation     | Rows     | Median  | Throughput      |
| ------------- | -------- | ------- | --------------- |
| bulk insert   | 100,000  |  762 ms | **131k rows/s** |
| bcp insert    | 100,000  |  764 ms | **131k rows/s** |
| bcp insert    |  10,000  |   77 ms | 129k rows/s     |
| select (array)| 100,000  |  891 ms | 112k rows/s     |
| select (stream)| 100,000 |  815 ms | 122k rows/s     |

Reproduce: `node samples/javascript/benchmark.js --rows 1000,10000,100000 --modes bulk,bcp,select`. Numbers depend on RTT, schema width and server hardware — use the script to get your own.

---

## Install

```sh
npm install msnodesqlv8 --save
```

Prebuilt binaries are downloaded automatically for Linux (x64, glibc ≥ 2.28 and musl), macOS (x64, arm64) and Windows (x64, ia32). Electron binaries are published alongside Node binaries for current major versions.

You also need a Microsoft ODBC driver on the host:

- **Linux / macOS**: [ODBC Driver 17 or 18](https://learn.microsoft.com/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server) (18 recommended, required for BCP).
- **Windows**: ODBC Driver 17 or 18 via the MSI installer. Older drivers (SQL Server Native Client) still work for non-BCP paths.

Building from source is documented in [docs/building-from-source.md](docs/building-from-source.md).

---

## Quick start

### Connect and query

```js
const sql = require('msnodesqlv8')

const cs = 'Driver={ODBC Driver 18 for SQL Server};Server=localhost;' +
           'Database=master;UID=sa;PWD=yourStrong(!)Password;Encrypt=no'

const conn = await sql.promises.open(cs)
const res  = await conn.promises.query('SELECT @@VERSION AS v')
console.log(res.first[0].v)
await conn.promises.close()
```

### Parameterised insert

```js
await conn.promises.query(
  'INSERT INTO trades (id, symbol, qty) VALUES (?, ?, ?)',
  [1, 'AAPL', 100]
)
```

### Bulk insert (the fast path)

```js
const table = await conn.promises.getTable('trades')
await table.promises.insert(rows)          // array-bind, ~130k rows/s
// table.setUseBcp(true)                    // opt-in to native BCP protocol
```

See [samples/javascript/](samples/javascript/) for runnable versions of every snippet below.

---

## Features

| Feature                    | Sample                                   | Notes |
| -------------------------- | ---------------------------------------- | ----- |
| Connect + query            | [simple-demo.js](samples/javascript/simple-demo.js)            | callback and promise APIs |
| Streaming results          | [streaming.js](samples/javascript/streaming.js)                | `on('row')`, `on('column')`, pause/resume |
| Stored procedures          | [procedure.js](samples/javascript/procedure.js)                | named params, output params, return code |
| Table-valued parameters    | [tvp.js](samples/javascript/tvp.js)                            | build TVP from object array |
| Bulk insert / update       | [table-builder.js](samples/javascript/table-builder.js)        | `BulkTableOpMgr` array bind |
| BCP fast insert            | [benchmark.js](samples/javascript/benchmark.js)                | `table.setUseBcp(true)` — ODBC 17/18 only |
| Connection pool            | [simple-pool.js](samples/javascript/simple-pool.js)            | built-in, no external dep |
| Pool scaling strategies    | [pool-scaling.js](samples/javascript/pool-scaling.js)          | see [docs/pool-efficient-strategy.md](docs/pool-efficient-strategy.md) |
| Prepared statements        | [test/prepared.test.js](test/prepared.test.js)                 | reuse parsed plan across calls |
| Transactions               | [txn.js](samples/javascript/txn.js)                            | explicit begin/commit/rollback |
| Pause / resume long query  | [paged-procedure-pause-resume.js](samples/javascript/paged-procedure-pause-resume.js) | backpressure for large result sets |
| Thread workers             | [thread-workers.js](samples/javascript/thread-workers.js)      | offload queries to `worker_threads` |
| Benchmark harness          | [benchmark.js](samples/javascript/benchmark.js)                | reproduces the numbers above |

Full API reference lives in the [wiki](https://github.com/TimelordUK/node-sqlserver-v8/wiki).

---

## Standalone example apps

Full runnable projects in their own repos, showing `msnodesqlv8` wired into real frameworks. The driver is a native addon — **do not call it from a UI thread** (renderer process, Next.js client components). Use a server route, API handler or worker.

| Stack                         | Repo |
| ----------------------------- | ---- |
| Next.js (pages router)        | [todo-with-nextjs_msnodesqlv8](https://github.com/TimelordUK/todo-with-nextjs_msnodesqlv8) |
| Next.js (app router)          | [todo-with-nextjs-app-router_msnodesqlv8](https://github.com/TimelordUK/todo-with-nextjs-app-router_msnodesqlv8) |
| Vite + Express                | [msnodesqlv8-vite](https://github.com/TimelordUK/msnodesqlv8-vite) |
| TypeScript                    | [msnodesqlv8_ts_sample](https://github.com/TimelordUK/msnodesqlv8_ts_sample) |
| JavaScript with IDE typings   | [msnodesqlv8_yarn_sample](https://github.com/TimelordUK/msnodesqlv8_yarn_sample) |
| Sequelize                     | [msnodesqlv8-sequelize](https://github.com/TimelordUK/msnodesqlv8-sequelize) |
| `mssql` package over this driver | [msnodesqlv8_mssql_sample](https://github.com/TimelordUK/msnodesqlv8_mssql_sample) |
| Electron                      | [msnodesqlv8-electron](https://github.com/TimelordUK/msnodesqlv8-electron) |
| React                         | [msnodesqlv8-react](https://github.com/TimelordUK/msnodesqlv8-react) |

---

## Platform support

| Platform              | Arch         | Node              | Electron |
| --------------------- | ------------ | ----------------- | -------- |
| Linux (glibc ≥ 2.28)  | x64          | 20, 22, 24        | 32+      |
| Linux (musl / Alpine) | x64          | 20, 22, 24        | 32+      |
| macOS                 | x64, arm64   | 20, 22, 24        | 32+      |
| Windows               | x64, ia32    | 20, 22, 24        | 32+      |
| Windows Integrated Auth | x64        | supported via `Trusted_Connection=yes` | — |

Tested against SQL Server 2017, 2019, 2022. Sybase ASE support is smaller in scope — see [samples/javascript/sybase-query.js](samples/javascript/sybase-query.js) and the wiki.

---

## Troubleshooting

**`IM002: Data source name not found`** — no matching ODBC driver installed. On Linux/macOS check `odbcinst -q -d`. On Windows check `ODBC Data Sources (64-bit)`.

**`SSL Provider: certificate verify failed`** on newer SQL Server — add `Encrypt=yes;TrustServerCertificate=yes` to the connection string, or install the server certificate.

**Segfault on Ubuntu/Debian with Node 18/20** — requires OpenSSL 3.2. See `tool/openssl.sh` in this repo and the [wiki install notes](https://github.com/TimelordUK/node-sqlserver-v8/wiki).

**BCP crashes or silently falls back** — BCP requires ODBC Driver 17 or 18 *exactly*. Any older driver (SQL Server Native Client, FreeTDS) will either crash the process or silently no-op. Check with `odbcinst -q -d`.

**Prebuilt binary fails to load** — your glibc, Node ABI or Electron version may not match a published binary. Try building from source: [docs/building-from-source.md](docs/building-from-source.md).

More issues and workarounds: [GitHub Issues](https://github.com/TimelordUK/node-sqlserver-v8/issues).

---

## Links

- [Wiki (API reference, deep dives)](https://github.com/TimelordUK/node-sqlserver-v8/wiki)
- [Samples](samples/javascript/)
- [Test suite](test/) — authoritative usage examples for every feature
- [Changelog / releases](https://github.com/TimelordUK/node-sqlserver-v8/releases)
- [Issues](https://github.com/TimelordUK/node-sqlserver-v8/issues)
- Legacy README (pre-rewrite, for reference): [docs/README-legacy.md](docs/README-legacy.md)

## License

Apache 2.0. See [LICENSE.txt](LICENSE.txt).
