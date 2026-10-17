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

Still open, not this change: `queue/bind-failure-then-two-on-start` is non-deterministic
(#481, overlapping follow-ups), and so is `cancel/paused-before-execute` (#479, `free` x2).

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
