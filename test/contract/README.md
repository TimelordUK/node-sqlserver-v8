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
| `recorder.js` | runs a scenario and records the transcript; line format documented at the top |
| `corpus.js` | reads / writes / diffs corpus files |
| `capture.js` | CLI to record and compare |
| `contract.test.js` | mocha: every scenario must match its corpus file |
| `run-one.js` | runs one scenario in a child process, so a hang or runaway can't affect the next |

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
