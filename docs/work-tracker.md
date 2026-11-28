# Work tracker

Concrete work we have decided to do, and what we found while doing it. Ideas and possible
directions live in [ROADMAP.md](../ROADMAP.md); bugs reported by users live in
[GitHub issues](https://github.com/TimelordUK/node-sqlserver-v8/issues). When an item here
is done, move it to **Done** with the PR number, and drop it at the next release.

## In progress

### Leak soak tool - PR #518
`samples/javascript/leak-soak.js` runs each query path many times on one connection and
reports native memory growth per operation. It confirmed the #517 leak (70-110 B per
query on 6.2.1, flat after the fix). Merge, then use it before each release.

### Open issue backlog
16 issues open as of 2026-10-30, some for years. Take them one at a time. Where the
answer is "the ODBC driver does that", answer it with a short doc note rather than code
(as #323 got [kerberos-linux.md](kerberos-linux.md)).

## Next

### #530 and #534 - long string parameters
- **#534:** any `varchar` parameter over 8,000 characters fails with `Invalid precision value`,
  on any connection, through `callProc` or a typed `sql.VarChar`. `reserve_var_char_array`
  switches to `SQL_WLONGVARCHAR` with size 0 while the C type stays `SQL_C_CHAR`.
- **#530:** an encrypted `nvarchar(max)` rejects strings over 4,000 characters ("Encryption
  scheme mismatch ... PLAINTEXT"); they bind as `SQL_WLONGVARCHAR`. Confirm the cause first.

Likely one fix: bind long strings as the plain type with size 0 (`max`), as #529 did for binary.
Mind the `SQL_WCHAR`-at-4,000 and `varchar` 8,000 special cases. Add plain round trips (so every
CI platform covers it) and `nvarchar(max)` / `varchar(max)` cases with `encryptedColumn` in
`test/encrypt.test.js`.

### CI hardening
From a review of every test run from 16 to 28 November: one real test flake, the rest infrastructure.
- **SQL Server fails to start on Windows** (mssqlsuite `Restart-Service`), the most common
  cause of reruns. Retry the step.
- **`contract/replay` "paused-resumed-after-cancel-at-100"** flaked once (Windows, Node 26).
  The seed does not make the run deterministic: after an event-loop stall the fake driver's
  hold times collapse to 0 (`test/common/fake-native.js` `holdFor`), so the scenario's 50 ms
  resume timer can fire before the cancel callback. Possibly also a real window in the JS:
  `resume()` between the cancel being sent and its callback can issue a fetch, since
  `pausedCancelled` is only set in that callback (`lib/reader.js`). Not yet verified.

### Document: Always Encrypted needs typed parameters
In a plain `query`, untyped values (`null`, a JS string for `varchar`, a `Date` for
`datetime2`) bind as the library's default type, and Always Encrypted converts nothing, so
they are rejected. `callProc` and the table manager know the column types; a plain query needs
`sql.Int(null)`, `sql.VarChar(...)`, `sql.DateTime2(...)` and so on.

### Keep splitting `OdbcStatementLegacy`
It is already split into `_params`, `_prepared`, `_read` and `_strings`. TVP handling is not
encapsulated: it is spread through `bound_datum.cpp`, `bound_datum_set.cpp`,
`query_parameter.h` and `odbc_statement_legacy_params.cpp`. Pull it into one unit.

### C++ tests - start again
`test/cpp` does not compile. It was dropped because keeping it working during the N-API port
took too long, but it holds reasonable ideas. Start again rather than repair:
1. Build a usable mock of the ODBC API (`IOdbcApi`) that scripts what each call returns.
2. Get a few simple tests working against it.
3. Test the main transformation points directly in C++: chunked `SQLGetData` reads
   (including `SQL_NO_TOTAL`), parameter binding type and size choices, and column
   conversion. #525 is the example: it needed an encrypted SQL Server to reproduce, but a
   mocked `SQLGetData` returning -4 would have caught it.
4. Aim to drive the real `OdbcStatementLegacy` and connection against the mock, so a test
   covers the whole bridge, JS to C++ to ODBC and back, and all the type mapping. The binding
   bugs of November 2026 (#528, #531 to #534: wrong `SQLBindParameter` type or size, a null
   data pointer, a missing `SQL_CA_SS_SERVER_TYPE`) would show up as wrong recorded
   arguments, without a live server.

Salvage the basic ideas only; most of `test/cpp` no longer matches the code. The
`diagnostics_tests` target (Logger plus `mock_odbc_api.h`) is the shape to start from.
Planned for the same session as Trusted Publishing.

### npm Trusted Publishing
Publishing uses the `NPM_TOKEN` secret, a granular token that npm revokes in January 2027
because it publishes without 2FA, whatever its expiry. Move `npm-publish.yml` to Trusted
Publishing: on npmjs.com add this repo and `npm-publish.yml` as the package's trusted
publisher; in the workflow add `permissions: id-token: write`, run npm 11.5.1 or later for
the publish step, and drop `NODE_AUTH_TOKEN`. `promote-tag.yml` also uses the token.

### Prepared statement re-execute growth - unresolved
Re-executing one prepared statement reads 18-75 B per execute from run to run, with or
without #517. The no-parameter control (`preparedPlain`) swings 6-56 B, so this may be
allocator or driver noise, not a leak. Resetting the parameter bindings
(`SQL_RESET_PARAMS`) before each execute made no difference.
- Run `leak-soak.js --scenario prepared,preparedPlain --samples` and look at the curve:
  a leak climbs steadily, noise steps and levels off.
- Repeat on Linux, where `Private_Dirty` is a cleaner measure than Windows private bytes.

### Pool loses a slot when a reconnect fails - `lib/pool.js`
`recreate()` and `parkDescription()` never lower `busyConnectionCount` or
`parkingConnectionCount` when the close or reopen fails. Each failure takes one slot off
the ceiling for good, so a database outage can leave the pool with no capacity. Also
`recreate()` has no `catch` on its outer `Promise.all`. Belongs with the pool review below.

### Smaller findings from the leak audit (not yet verified line by line)
- **Transaction errors pile up.** A failed begin, commit or rollback appends to the
  connection's error list without clearing it (`odbc_connection.cpp`, transaction methods).
  The next error report then includes stale errors.
- **Cancel promise listeners.** `StreamEventsPromises.cancel` (`lib/notifier.js`) adds `free`
  and `error` listeners on each call and never removes them. On a reused prepared statement
  they pile up.
- **Pool procedure cache pins a connection.** The cache of procedure definitions is shared
  across pool members, and each definition keeps the connection it was described on
  (`lib/procedure-bound.js`). `callproc` from any member then runs on that one connection.
- **`BindQuery` reads the query id map unlocked** (`odbc_connection.cpp`). Safe today because
  frees go through the work queue; lock just the lookup, not `BindExecute`, for consistency.

### Pool design review
A systematic review of `lib/pool.js`. Its state is spread across the container rather than
held per connection, which is the root of the slot leak above. The pool tests are
timing-based and flaky; they need a deterministic mock (the stub primitive already exists
in `test/common/fake-native.js`).

## Later

- **Lint cleanup** - about 75 eslint violations; the code has not been linted in years.
- **Console showcase** - one self-cleaning console program that demos every feature, to
  become the headline reference.
- **Wiki** - rebuild `wiki.md` from scratch, with sample code leading over prose.

## Done

Nothing since 6.3.0. Earlier work is listed in the GitHub release notes.
