# Handover: 5.6.0 event regressions (#478 – #481) — 2026-10-15

Where the investigation of dhensby's reports stands, and where to pick it up.

## Summary

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

## The contract (owner, 2026-10-17), to ship as v6

- `done`: no more results. Raised on **every** query, exactly once: errors, cancels and bind
  failures included.
- `free`: the native statement has been released. It comes after `done`.
- Nothing after `done` but `free`; an in-flight error may be unavoidable.
- A paused query emits nothing until resumed, and holds the connection.

`done` is not raised by any `errors/*` scenario today. On cancel it comes before the HY008.
Prepared executions never raise `free` (there is no free item for them).

## Linux: results after an error at execute are lost (5.6.0, not this branch)

On Linux (msodbcsql18, CI's Ubuntu and WSL Fedora), when the first statement of a batch fails
at execute, the error comes with `more=false` and the rest of the batch is lost: no
`rowcount`, no following result set, no `done`. Windows gives `more=true`, then the rest. So
the #475 fix in 5.6.0 (`odbc_statement_legacy.cpp`, the look-ahead after a failed execute)
does not hold on Linux. The same 4 scenarios differ with the base commit's `lib/`, so it is
older than the queue work. Pinned as `errors/{raiserror-then-result,dup-key-d}.*.linux.txt`,
`# status: known-bug`, so that CI is green and the fix shows up as a diff.

To run the corpus on WSL: a `git worktree` under `/tmp/<x>/node_modules/msnodesqlv8` (the
tests `require('msnodesqlv8')`), `npx node-gyp rebuild`, copy `.env-cmdrc`, symlink
`node_modules` from an existing checkout.

## Next

1. A fake native connection (`test/common/fake-native.js`) that holds every callback until
   the test releases it, and asserts the invariants (one native call in flight per
   connection, nothing after `releaseStatement` or `free`, one `done` then `free`). Then
   scripted tests and an interleaving explorer for queue and reader.
2. Cases to pin with it: an error coming back from a fetch in flight when the pause lands
   (today it is emitted while paused, but the rows are held). Already in the corpus against a
   real server: pause then cancel a compound query with another queued
   (`queue/paused-then-cancel-queued-before`), and submit while paused (`queue/paused-then-submit`).
3. `done` on every path (#479, the errors), then #478.

Open decision: a pause that lands while a native call is in flight still lets that call's
events out, e.g. the next result set's `meta`. Should paused mean no events at all?

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

## Suggested order

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

## Decisions to make while reviewing the corpus

- Callback before the next result set's `meta`? (recommended: yes)
- On cancel: `cancel-cb` → `error HY008` → `done` → `free`, or no `done` at all on cancel?
  node-mssql asked for `done` on cancel back in #120.
- A cancel that finds nothing to cancel (late, or refused): an error in the cancel callback,
  and no other events.
- Should anything ever come after `free`? (recommended: no)

## Picking up on another machine

```sh
git fetch && git checkout test/event-contract-corpus
npm run fetch-prebuild        # or build
npx mocha test/contract/contract.test.js        # ~40 s, expect 77 passing
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
