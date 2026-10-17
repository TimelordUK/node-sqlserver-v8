# Event contract corpus

Most tests check what a query returns. These check **the exact sequence of events** it
raises — `submitted`, `meta`, `row`, `info`, `error`, `done`, `free`, callbacks, cancel
callbacks — for a growing set of scenarios, including the edge cases (errors part way
through a batch, pause at a batch boundary, cancel at every stage, work queued behind a
failed query).

Each scenario's expected transcript is a text file in `corpus/`, so a change to the
event order shows up as a diff in review, and the contract can be discussed line by line.

| File | What it is |
|---|---|
| `scenarios.js` | the scenarios: query, setup, actions (pause / resume / cancel at row n, at start, after n ms, after free), follow-up queries |
| `scripts/` | scripted scenarios, for what one query can't say: the issue repros (`issue-478.js` ...), several cases in sequence. See `scripts/README.md` |
| `record.js` | `npm run record-corpus -- <tester.js>`: copies a script into `scripts/` and records its transcript and native log |
| `recorder.js` | runs a scenario and records the transcript; line format documented at the top |
| `corpus.js` | reads / writes / diffs corpus files |
| `capture.js` | CLI to record and compare |
| `contract.test.js` | mocha: every scenario must match its corpus file |
| `run-one.js` | runs one scenario in a child process, so a hang or runaway can't affect the next |
| `native-tap.js` | records the native calls of a run: each call into the driver, state change and result, in order |
| `native/` | those recordings, `<name>.<platform>.json`, one per scenario |
| `replay.js`, `replay.test.js` | replay each recording over the fake driver (`test/common/fake-native.js`), through the real JS layer, with no server |

## Workflow

```sh
# compare what happens now with the corpus (each scenario 3 times, to catch nondeterminism)
node test/contract/capture.js cancel/

# record what happens now (new scenarios, or after an intended change)
node test/contract/capture.js --update dup-key

# see how another build behaves against the same corpus, e.g. an older release
node test/contract/capture.js --root ../some-dir/node_modules/msnodesqlv8

# run as a test
npx mocha test/contract/contract.test.js
```

## Replaying without a server

`capture.js --native` records, for each scenario, what passed between the JS layer and the
native driver (secrets and host names are left out). `replay.test.js` replays it: the fake
driver answers each call with what the real one answered, in causal order. The transcript
has to match the corpus, and the fake checks that the JS respects the driver:

- `overlap`: a second call (a cancel apart) while one is still in flight on the connection;
- `after release`: a call on a released statement;
- `diverged` / `unrecorded`: a call the recording doesn't have next, or at all;
- `stalled`: JS waits on a result that waits on a call JS never makes.

A race the real driver shows once in ten runs then fails every time. Against 5.6.0's `lib/`
it reports the pause crash (`diverged: nextResultSet ... where the log has fetchRows`), #481
(`overlap: query while query in flight`) and the late free (`stalled`).

```sh
node test/contract/capture.js --native cancel/   # record (keeps a log only if its run matches the corpus)
node test/contract/replay.js cancel/             # replay and compare
npx mocha test/contract/replay.test.js           # all of them, ~20 s
```

When a change to the JS is meant to change the native calls (not just the events), record
again. The recordings are per platform, because the drivers differ (#483).

Each result is held for as long as the driver took to give it, so a scenario that acts on a
timer (pause after 100 ms) replays with the timing the server gave it.

## Exploring timing

`explore.js` replays each recording many times, holding each result for its recorded
latency, give or take a fifth, plus a few ms. The scenario's own timers and the JS layer's
steps then land at different points against the driver's results. A contract has to hold
whatever the timing: every run must match the corpus with no violations. A `timed`
scenario, one whose pause comes from a timer, is compared by shape and total rows, since
how the rows split around the pause is timing.

```sh
node test/contract/explore.js --runs 20 pause/        # 20 timings per scenario
node test/contract/explore.js --scale 10 cancel/      # wider jitter
node test/contract/explore.js --seed 7 --runs 1 x     # replay exactly the timing of a failure
```

## Status of a transcript

Each file has `# status: unreviewed` or `# status: agreed`.

- **unreviewed** — captured from what the driver does today. It pins current behaviour,
  bugs included, so that any change is visible.
- **agreed** — someone has read it and it is the contract. To change the contract, edit
  the transcript to what it should be and mark it agreed; the test fails until the
  driver does that.

A file may list several accepted transcripts separated by `--- or`, and `capture.js`
marks a scenario `NOT DETERMINISTIC` when runs differ. Treat both as something to fix:
the aim is a predictable API.

A platform or ODBC driver that legitimately behaves differently can have its own file,
`<name>.<platform>.txt`.
