# Scripted scenarios

A scenario in `scenarios.js` is one query and what is done to it. A script is for everything
else: several queries in sequence, several cases in one transcript, a repro from an issue.
Each `.js` file here is the scenario `scripts/<file name>`, with its transcript in
`corpus/scripts/<file name>.txt`. It is run, compared and replayed like any other scenario.

## Recording one

```sh
npm run record-corpus -- path/to/tester.js            # copies it here, records it
npm run record-corpus -- path/to/tester.js --name x   # under another name
npm run record-corpus -- test/contract/scripts/x.js   # record one that is here again
```

The script is run 3 times, each in its own process. The command reports whether every run
gave the same transcript, then writes it (`# status: unreviewed`) and its native recording.
Read the transcript, edit it to what the contract should be, and mark it `agreed`.

## Writing one

A script exports one async function. It gets one connection, opened for it, and helpers
that log in the corpus's format:

```js
module.exports = async t => {
  t.section('A running cancel')
  t.query('A', BIG, null, { at: { row: { 100: ['cancel'] } } })
  await t.settled('A')
}
```

| | |
|---|---|
| `t.query(label, sql, params, options)` | runs a query on the connection and logs its events as `label: <event>`. Returns the query (its event emitter). `options`: `callback` (also pass a callback and log it), `columns` (log column values), `at` (actions, as in `scenarios.js`: `start`, `row: { n: [...] }`, `later: { ms: [...] }`, `free`) |
| `t.act(label, actions)` | do `pause`, `resume`, `resume:<ms>` or `cancel` to that query now |
| `t.freed(label)` | resolves on the query's `free` |
| `t.settled(label)` | its `free`, plus the time in which late events still belong to the transcript (a cancel callback after `free`, say) |
| `t.section(title)` | a `== title` line, to divide cases |
| `t.note(text)` | a `-- text` line |
| `t.log(label, line)` | any other line, as `label: line` |
| `t.delay(ms)`, `t.sql`, `t.conn` | a delay, the module, the connection |

Labels have to be unique within a script. Wait for each case (`settled`) before the next,
so the transcript doesn't depend on timing. A transcript has to come out the same every
run, or it isn't a contract.
