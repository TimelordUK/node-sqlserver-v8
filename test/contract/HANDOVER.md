# Handover: the v6 event contract (from the 5.6.0 regressions, #478 – #481)

Started 2026-10-15 from dhensby's reports. Last updated 2026-10-18. The newest state is
first; the dated Progress sections below have the detail, and the older sections are history.

## Where we are — end of 2026-10-18

**All four issues are fixed on master** (PRs #482, #484 – #491). #492, the prepared statement
lifecycle, was open at the end of the day. Nothing is released yet: it ships as **v6**.

| Issue | State |
|---|---|
| #481 work queue after a failure | fixed, closed |
| #480 pause on the last row skipped a result set (and the pause crash) | fixed; closing comment posted |
| #479 `done` on cancel: early, doubled or missing | fixed; closing comment posted |
| #478 info before its error (3621 before 2627) | fixed (#491) |
| #483 Linux: rest of the batch lost after an error at execute | open, native, pinned `known-bug` |

**Guarding against regressions**, all run on every PR into master:
- the corpus against a live server, on Windows and Linux;
- the replay of every native recording over the fake driver, on Windows, Linux and macOS;
- jittered replays of the timing-sensitive groups.

The tools are `capture.js`, `replay.js`, `explore.js` and `npm run record-corpus`, and the
script helpers `t.watch` and `t.next` for prepared statements. Corpus status at the end of the day:
64 `agreed`, 6 `known-bug` (the Linux pins for #483) and 36 `unreviewed`. The unreviewed ones
are all of `read/`, `pause/two-by-51-*`, `errors/{bind-failure.events,raiserror-then-result.*,
two-raiserrors-then-result.*}` and `scripts/issue-480`.

**Before releasing v6:** release notes on the GitHub release, listing every behaviour change in
the contract below. Workarounds for a missing or doubled `done` (node-mssql 12.7.8+) may
break. Then decide the node-mssql guard: an RC on `next` for dhensby, node-mssql-shaped
scenarios, or their suite as a canary job.

## Summary at first handover (2026-10-15)

The normal streaming path is fine: plain reads, multiple result sets, and pause/resume part
way through a batch. The **event contract at the edges** is broken: the order of errors and
infos, cancel, pausing at a batch boundary, and the work queue after a failure. node-mssql
drives all of those. Every point in the four issues reproduced on localdb (ODBC 18, Windows).

## Progress — 2026-10-17

**Fixed: the pause/resume crash, #480, and the loop after pausing on the last row.** All
three had one cause. A pause on the *last* row of a batch was ignored: `dispatch()` went on to
`nextResult()` (or ended the query) while paused, and `resume()` then did the same step again
from the stale `batchData`. If the first `nextResultSet` was still in flight, two native calls
ran on one statement at once (0xC0000005). If it had finished, the second one skipped a
whole result set (#480). Or, at the end of the last set, `done`/`free` came out twice and
then the endless `rowcount 0` loop.

The fix in `lib/reader.js`: a query has exactly one next step at any time. Either it is
running, or it is *parked* by a pause (`park()`, `continueBatch()`). `resume()` runs the
parked step and never starts another. Nothing that a step would emit, `done` included,
comes out while paused, except what a native call already in flight brings back.
- `pause/every-row`, `pause/two-by-51-at-51`, `pause/two-by-51-at-102` are now
  `# status: agreed`. every-row: 23 runs the same, no crash.
- `test/pause.test.js` "should handle multiple pause calls" expected `done` while still
  paused. It now resumes, then expects `done`.
- Full mocha suite: 897 passing; the only failures were the three transcripts above, before
  they were updated.

**Fixed: #481, the work queue.** Every item on the queue is now finished by its owner:
`WorkQueue.finish(op)` removes that item only (by identity), starts the next only if it was
the head, and does nothing the second time. The blind `nextOp()` is gone.
- Each query keeps its own queue item (`Query.operation`). A prepared statement shares one
  notify across its executions, so `notify.getOperation()` is only the latest one queued.
- A statement's unbind and free are *follow-ups* (`enqueueFollowUp`). They run straight after
  their query, before anything that was already waiting. Before, q2 (or `close()`) could run
  ahead of q1's free.
- `close()` always finishes its item. The cancelled branch of `moveToNextResult` had cleared
  `running` first, so `close()` returned early. That is what the extra advance in `end()`
  (93f1590f) was covering.
- `dropItem` matches by identity. It used to drop every item with the same priority.

**Fixed: a paused query holds the connection.** Owner's rule: once paused, no other operation
runs on the connection.
- A paused query keeps its place at the head. Before, it moved to the back, and `park()` then
  removed the item that was waiting behind it **without running it**. On 5.6.0 such a query was
  never submitted and its callback never fired.
- Work submitted while a query is paused is **refused** (owner's decision): a query gets an
  error with sqlstate `HY010` (function sequence error), then `done` and `free`, and no
  `submitted`. `beginTransaction`, `commit`, `rollback` and `prepare` get the error in their
  callback. Work queued *before* the pause waits its turn. (`headPaused`, which freed the paused
  query when a new one came, is gone.) Corpus: `queue/paused-then-*`.
- Cancelling a paused query sends the native cancel, then ends the query as cancelled
  (`Query.cancelPaused`): `error HY008` → `free`, the same as cancelling one that is not paused.
  Before, it was freed silently. Once the cancel is accepted the query no longer holds the
  connection, so work submitted from the cancel callback queues behind it.
- `close()` cancels a paused query at the head first, so the close cannot wait forever.

Corpus: all 11 changed `queue/*` and `cancel/paused-*` transcripts re-recorded, now
deterministic. No more "Connection is busy"; `paused-before-execute` frees once.
`queue/ok-then-two-on-*` are agreed. The rest still show #479/#478 behaviour, so they stay
unreviewed. Tests changed to the new rules: `pause.test.js` (a new query waits; close and
cancel give HY008) and `querycancel.test.js` (HY008 on a paused cancel).

## The contract (owner, 2026-10-17 – 18), to ship as v6

- **`done`**: no more results. Raised on every query, exactly once, whatever happened:
  success, error, bind failure, cancel, refusal. It comes after the query's errors and after
  its callback.
- **`free`**: the native statement has been released. It always comes after `done`. Nothing
  comes after `done` but `free`.
- **Pause:** a paused query emits nothing until it is resumed, including what a native call in
  flight brings back. It holds the connection: new work is refused with HY010. Work queued
  before the pause waits its turn.
- **Cancel:** an accepted cancel gives `cancel-cb ok` → `error HY008` → `done` → `free`. A
  cancel that is not accepted (too late, refused by the driver, or a repeat: one cancel per
  query) gives only an error in its own callback, a tick later. It is never thrown and never
  touches the query's events. Every cancel's callback is called.
- **Diagnostics** are routed in driver order. `more` is counted over errors only.
- **Prepared statements:** each execution is `submitted` … `done`, with no `free`. `ps.free()`
  raises `free` once, when the native statement is released. After that, an execution is
  refused with HY010 (its error or callback, then `done`), and a second `free()` with an error
  in its callback.

## Linux: results after an error at execute are lost (5.6.0, not this branch)

On Linux (msodbcsql18, CI's Ubuntu and WSL Fedora), when the first statement of a batch fails
at execute, the error comes with `more=false` and the rest of the batch is lost: no
`rowcount`, no following result set, no `done`. Windows gives `more=true`, then the rest. So
the #475 fix in 5.6.0 (`odbc_statement_legacy.cpp`, the look-ahead after a failed execute)
does not hold on Linux. The same 4 scenarios differ with the base commit's `lib/`, so it is
older than the queue work. Pinned as `errors/{raiserror-then-result,dup-key-d}.*.linux.txt`
`scripts/issue-478.linux.txt` (its case D) and `cancel/after-error-mid-batch.events.linux.txt` (the batch is gone, so the cancel finds nothing), `# status: known-bug`, so that CI is green
and the fix shows up as a diff. Filed as #483.

To run the corpus on WSL: a `git worktree` under `/tmp/<x>/node_modules/msnodesqlv8` (the
tests `require('msnodesqlv8')`), `npx node-gyp rebuild`, copy `.env-cmdrc`, symlink
`node_modules` from an existing checkout.

## Progress — 2026-10-18: `done` on every query

- The `Query` alone raises `done`, exactly once (`raiseDone`), a tick after the error and
  the user's callback (the connection defers that by one tick). `free` waits for it
  (`Query.afterDone`, used by `DriverMgr.raiseFree`), and the queue moves on only after both.
- Error paths (`end`, the execute failure in `begin`) now raise `done`; before, `end` set
  `this.done` and never emitted it. A throwing listener cannot cost the query its `done` or
  `free` (`finally`). A bind failure holds the queue until its `done` and `free`.
- Cancel: `connection.cancelQuery` no longer emits `done`. A cancel gives
  `cancel-cb ok` → `error HY008` → `done` → `free`; a late cancel only the error in its
  callback (#479 A and B). A bound procedure refused for bad params raises `done` then `free`.
- Corpus: 42 transcripts changed. Those that meet the contract are `agreed`. #478 (info before
  the error, every `dup-key-*`, `scripts/issue-478`) and #479 C (`cancel/streaming-after-print-at-100`,
  `scripts/issue-479`) are `known-bug`. The Linux pins were edited by hand to the same rule,
  and the replay of the Linux recordings matches them.
- `connection-pool.test.js` "submit error queries with callback": its pool `error` listener
  asserted, and the throw had been swallowed. It now counts the pool errors and the `done`s.

## Progress — 2026-10-18: cancel always takes effect, or says it did not (#479 C)

Native (`odbc_statement_legacy.cpp`):
- `return_odbc_error` puts the statement in `STATEMENT_ERROR` only for a real error, not for
  info (`01xxx`). A PRINT left a reading statement in error, and `Cancel()` refused it.
- `look_ahead_after_error`: when the batch goes on after a failed statement, the statement is
  `READING` again, so the rest of the batch can be cancelled.
- `try_read_next_result`: a cancel that landed between calls ends the query with HY008
  (`return_cancelled`) instead of silently.

JS: a cancel the driver refuses (`cancelQuery` calls back `(null, false)`) is now an error in
the cancel callback, "cannot cancel query (refused by the driver)". Before, it said ok.

So every accepted cancel gives `cancel-cb ok` → `error HY008` → `done` → `free`, and a cancel that
is not accepted gives only the error in its callback. New scenario `cancel/after-error-mid-batch`
(and an `at.error` trigger). `cancel/last-row` gains its HY008. All `cancel/*` and
`scripts/issue-479` are agreed. Their Windows native logs were re-recorded; the Linux corpus
has no pins for them, so CI on Linux checks the native change there.

## Progress — 2026-10-18: a repeated cancel is answered, not left dangling

`StreamEvents.cancelQuery` ignored a second cancel: it never called its callback, so a
caller awaiting it hung. Before execute, the second overwrote the first's pending token,
and the first was the one never answered. Now one cancel per query: a repeat is refused in
its own callback a tick later ("cancel already requested"), and the query's events are
untouched (one HY008, `done`, `free`). It is not thrown, because cancels are issued from
inside event handlers. The deferred cancel is sent through `sendDeferredCancel`, which
clears the token first. New, agreed: `cancel/twice-*`, `cancel/again-after-confirm-*`
(`cancel:again` cancels again from the first callback), `cancel/paused-twice-at-100`,
`cancel/paused-again-after-confirm-at-100`, `cancel/paused-before-execute-twice`, and
`cancel/paused-resumed-after-cancel-at-100` (a resume after the cancel does nothing).

## Progress — 2026-10-18: diagnostics in driver order (#478)

`dispatchInfoReturnErrors` routed a set's info at once and handed back only its errors, so
3621 "The statement has been terminated." overtook its 2627. Now a set with an error in it is
routed whole, in driver order, by the error path. A set of info only is routed at once, as
before. `routeStatementError` counts `more` over errors only: an error has more when another
error follows it or the batch goes on. Before, it also counted info, which was latent while
info and errors were routed apart. In callback mode, info that follows an error in a set is
emitted a tick on, after the (deferred) callback. `asCancelled` ignores info. New:
`errors/two-errors-one-statement` (1779 then 1750). All `dup-key-*` and `scripts/issue-478`
are agreed; the Linux pins were reordered by hand and stay known-bug for #483.

Found while there, not fixed: info from some DDL is mostly lost, on master too. 1756
"Skipping FOREIGN KEY constraint ... for temporary table" from
`create table #fk (id int constraint fk_x references no_such_table(id))` came 0 of 20 times
on master and 1 of 20 here, while PRINT info always comes. It is probably native: the
diagnostics are not read when the driver returns plain `SQL_SUCCESS`.

## Progress — 2026-10-18: the prepared statement lifecycle

The owner's rule: a prepared statement's executions are each `submitted` … `done`, with no
`free`. `free` is raised once, by `ps.free()`, when the native statement is released. After
that, any use of the statement is an error. Corpus: `scripts/prepared` (agreed), recorded
through the new `t.watch` and `t.next` script helpers. Executions share one query object and
raise no free, so `t.query` does not fit them.

- Native (`bind_fetch`): each execution clears the last one's diagnostics and closes the
  cursor it left open. After an execution failed part way (divide by zero), the next one
  failed with 24000 invalid cursor state and then reported the old error again, and stale
  errors were reported even after free.
- `PreparedStatement` (`lib/prepared-statement.js`): once `free()` is called, an execution is
  refused with HY010, "prepared statement N has been freed". That is the error or callback,
  then `done`, with no native call. Before, it ran natively on the released handle, with two
  callbacks and a garbled message. A second `free()` is refused in its callback. Before, it
  threw "Invalid statement handle" and the connection could not close. A `free()` asked for
  while an execution runs waits for it: the execution's `done`, then `free`.

Found, not fixed: a prepared select with no table behind it (`select 10 / ? as n`) is
described with no columns at prepare, so its executions return no rows (`rowcount 1`, no
`meta`).

## Next

### 1. Nothing the driver sends is dropped (the next session's theme)

Any information the driver sends should reach the caller. Today some is silently lost:
- Info from some DDL is mostly lost, on master too: 1756 "Skipping FOREIGN KEY constraint …
  for temporary table", from `create table #fk (id int constraint fk_x references
  no_such_table(id))`, came 0 of 20 times on master. PRINT info always comes. It is probably
  native: the diagnostics are not read when a call returns plain `SQL_SUCCESS`, or are read
  only on some paths. Check every ODBC call that can carry diagnostics: `SQLExecDirect`,
  `SQLExecute`, `SQLFetch`, `SQLMoreResults` (SQL_NO_DATA included), `SQLRowCount`, and the
  cancel path.
- A prepared select with no table behind it (`select 10 / ? as n`) is described with no
  columns at prepare, so its executions return no rows: `rowcount 1`, no `meta`.

Plan: a new corpus group, `info/`, before any fix:
- PRINT in each position: first, between results, last, after an error, inside a proc;
- RAISERROR severity 0 – 10 (info) next to 11+ (error), and `with nowait`;
- DDL warnings (1756 and others), `set` warnings (ANSI_WARNINGS, arithmetic overflow at
  warning level), a truncation warning (01004), and the 3621 that follows a failed statement;
- many messages in one batch, more than one packet, to check that none are lost or reordered;
- each of these through a stored procedure, a prepared statement and a polling query.

Then agree the transcripts, watch them fail, and fix (mostly native). Record native logs so
that replay covers them.

### 2. Smaller items

- Hold an error *at execute* while paused. `free` now waits for `done`, which removes the
  reason it was not held (see Settled, below).
- #483 (Linux, native) on WSL. When it is fixed, the `known-bug` Linux pins show as diffs:
  `errors/{raiserror-then-result,dup-key-d}.*.linux.txt`, `scripts/issue-478.linux.txt`,
  `cancel/after-error-mid-batch.events.linux.txt`.
- A race in accepted cancels: the cancel's own callback (`cancel-cb ok`) and the HY008 from the
  fetch in flight are two native completions on different threads, so either can reach JS
  first. CI showed it on `cancel/twice-streaming-at-100`, which now has an `--- or`
  alternative (the first in the corpus). `cancel/again-after-confirm-at-100` failed once
  locally, probably the same race, but its transcript was not kept. Other accepted cancels
  of a statement in flight can show it too: add the alternative when one does. Or tighten the
  contract: hold the HY008 in JS until the cancel callback has run, so that `cancel-cb ok`
  always comes first. That is the owner's call. Note that `capture.js --update` rewrites a file
  from what it saw, so it drops an alternative it did not see.
- The 36 `unreviewed` transcripts (listed under Where we are): read them against the
  contract and agree them. `read/print-*` belong with the `info/` work above.

Settled (2026-10-17): a paused query emits nothing until resumed, including what a native
call that was in flight when the pause landed brings back: the `meta` after execute or after
`nextResultSet`, rows, and an error from a fetch or `nextResultSet` (with its `done` and
`free`). The explorer found the old behaviour: `pause/before-execute` gave `meta` before or
after the resume, depending on timing. Corpus: `pause/during-execute-then-{result,error}`,
`pause/during-fetch`. Still not held: an error *at execute* while paused, because `beginQuery`
queues the free before it rejects, so holding the error would let `free` out first.

## State at first handover

No fixes had been made. This branch adds:
- `test/contract/`: the event-contract corpus (see `README.md`), 77 scenarios, every one
  pinned to what **5.6.0 does today**, bugs included (`# status: unreviewed`);
- `test/contract/repro/`: dhensby's repro scripts from the issues, runnable as they are
  (`node test/contract/repro/i480.js`).

## Issues, as reproduced

| Issue | Seen on 5.6.0 | 5.5.1 | Corpus scenarios |
|---|---|---|---|
| #478 error/info order | `info 3621` before `error 2627` (A–C); D comes out in driver order | 3621 dropped | `errors/dup-key-*` |
| #479 A running cancel | `done` → cancel-cb → `error HY008` → `free` (`done` too early) | cancel refused | `cancel/streaming-at-100` |
| #479 B late cancel | an extra `done`, then cancel-cb error `empty queue` | refused | `cancel/late-after-free` |
| #479 C cancel after PRINT | cancel-cb **ok**, then all remaining rows stream and a 2nd `done` follows: nothing was cancelled | refused | `cancel/streaming-after-print-at-100` |
| #479 comment, point 4: pause + cancel a polling query | hangs: no `free`, connection stuck | works | polling, so out of the corpus (repro: `i479b.js 4`) |
| #479 comment, point 5: pause + cancel before execute | `free` x2; with polling, an endless `free`/`rowcount 0` loop and a busy connection | `free` x2 | `cancel/paused-before-execute` (repro: `i479b.js 5`) |
| #480 pause on the last row of a batch | the next result set is lost (`[51, 0]`) | same | `pause/two-by-51-at-51` |
| #481 queue advances once too often | follow-ups overlap: `HY000 Connection is busy with results for another command`; B2 cannot cancel | same (since 5.1.0) | `queue/*` |

Found by the corpus, beyond the issues:
- **Pausing and resuming on every row** (how Node stream back-pressure behaves) **crashes the
  process with 0xC0000005 (access violation) in about 1 run in 3** (`pause/every-row`). This is
  the worst finding.
- Pausing on the very last row and then resuming: `done`, `free`, then an endless `rowcount 0`
  loop (`pause/two-by-51-at-102`). 5.5.1 does the same. This is the open question at the end
  of #480.
- Polling, cancel mid-stream: cancel-cb ok, ~1000 more rows, then the connection is busy.
  Polling is out of scope for the contract.
- Callback mode: result set 2's `meta` arrives before result set 1's callback
  (`read/two-result-sets.callback`), because the callback is deferred with setImmediate in
  `connection.query`.

Against 5.5.1, `capture.js --root <5.5.1>` reports 23 of the 77 scenarios as different:
exactly the error, cancel and pause-on-last-row groups. Reads, the queue and pausing mid-batch
behave the same, so those bugs are older than 5.6.0.

## node-mssql's own suite

The tediousjs/node-mssql `test-msnodesqlv8` suite was run against localdb, with this repo
junctioned in as `node_modules/msnodesqlv8`:
- Both master and 12.7.7 fail the **same 6 tests on 5.5.1 and 5.6.0**. Those come from the
  environment: ODBC 18 message prefixes, and login/config tests that don't fit localdb.
- On 12.7.7 + 5.6.0, "a cancelled stream emits done event" failed once with
  `done() called multiple times` (#479) and passed on a rerun: it depends on timing.
- node-mssql 12.7.8 and later (released 2026-10-15) include their workarounds
  (tediousjs/node-mssql#1917). Users on ≤ 12.7.7 with 5.6.0 get the raw behaviour.
- Their test DB has to allow snapshot isolation (their CI uses `master`, which does).
  Otherwise their isolation-level test leaves SNAPSHOT on a pooled session and later tests
  fail in a cascade.

So their suite is worth adding to CI, but it would not reliably have caught these. The
corpus is our guard.

## Suggested order (2026-10-15; all done)

1. ~~**The crash on pause/resume on every row.**~~ Fixed, see Progress. The hypothesis was right:: `resume()` calls
   `dispatch()` (or `nextResult()`) while the previous `nativeGetRows` / `nextResultSet` is
   still in flight, so two native calls run on one statement at once. Nothing in `reader.js`
   stops a second fetch while one is outstanding. #480 is the same family: `dispatch()` and
   `resume()` both move to the next result. A first step is an "operation in flight" guard in
   `Query`, with `dispatch` / `nextResult` / `resume` going through it, then
   `capture.js --repeat 20 every-row`.
2. **#481 queue.** Make finishing an item specific to that item and idempotent
   (`WorkQueue.finish(op)`, as in dhensby's option 2).
3. ~~**#480 and the last-row loop.**~~ Fixed together with 1.
4. **#479 cancel.** `done` only for a cancel that worked, and after the HY008. Report a
   refused native cancel (`CancelWorker::OnOK` passes `(null, false)`). The `STATEMENT_ERROR`
   that info-only diagnostics set makes a cancel after a PRINT a silent no-op.
5. **#478.** Route each set of diagnostics in driver order. Count `more` over errors only.

For each one: edit the corpus transcripts to the agreed behaviour first (`# status: agreed`),
watch them fail, then fix.

## Decisions made while reviewing the corpus (all settled; see The contract)

- Callback before the next result set's `meta`? (recommended: yes)
- On cancel: `cancel-cb` → `error HY008` → `done` → `free`, or no `done` at all on cancel?
  node-mssql asked for `done` on cancel back in #120.
- A cancel that finds nothing to cancel (late, or refused): an error in the cancel callback,
  and no other events.
- Should anything ever come after `free`? (recommended: no)

## Picking up on another machine

```sh
git fetch && git checkout master
npx node-gyp rebuild          # native changes are not in a prebuild until v6 ships
npx mocha test/contract/contract.test.js test/contract/replay.test.js   # ~4 min
node test/contract/capture.js pause/            # compare a group, 3 runs each
```
- The connection comes from `.env-cmdrc` (`CONNECTION_KEY`) as for the other tests. The corpus
  was captured with ODBC Driver 18 against `(localdb)\node`, database `scratch`. Another
  driver may phrase messages differently; use `<name>.<platform>.txt` for genuine differences.
- To compare with 5.5.1: `npm i msnodesqlv8@5.5.1` in a scratch folder, then
  `capture.js --root <that>/node_modules/msnodesqlv8`.
- node-mssql: clone tediousjs/node-mssql, `npm i`, replace `node_modules/msnodesqlv8` with a
  junction to this repo, write `test/.mssql.json`
  (`{"connectionString": "...;Database=mssqltest;...", "options": {"trustedConnection": true, "trustServerCertificate": true}}`),
  create the DB with `alter database mssqltest set allow_snapshot_isolation on`, then
  `npx mocha --exit -t 30000 test/msnodesqlv8`.
