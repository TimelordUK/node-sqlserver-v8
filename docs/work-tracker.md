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

The `diagnostics_tests` target (Logger plus `mock_odbc_api.h`) is the shape to start from.

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

- **#528** - binary parameters over 2,000 bytes were bound as `SQL_LONGVARBINARY` (`image`),
  which Always Encrypted rejects for `varbinary(max)`; now `SQL_VARBINARY`, size 0 above
  8,000. Added encrypted `varbinary(max)` round trips (2,000 bytes to 1 MiB, by procedure and
  by query) that also cover #525.
- **#527** - removed the never-created non-legacy statement classes (`OdbcStatement`,
  `TransientStatement`, `PreparedStatement`, `TvpStatement`), about 2,000 lines;
  `OdbcStatementLegacy` is the only implementation.
- **#526** - #525: a truncated binary read reporting `SQL_NO_TOTAL` resized the buffer to -4
  and threw `Unknown exception occurred`; now reads in 24 KiB chunks (contributed).
- **#517** - query id to statement handle map erased on statement release and cleared on
  close; fixed a ~65 B per query native leak on long-lived connections (contributed).
- **#516** - [kerberos-linux.md](kerberos-linux.md): Windows authentication from Linux,
  closes #323.
