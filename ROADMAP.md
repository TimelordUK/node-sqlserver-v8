# Roadmap

Working notes on planned and possible future work for `msnodesqlv8`. Items are roughly grouped by risk profile, lowest first. None of these are commitments — this is a thinking document and items may move, drop, or expand as the codebase pulls them into focus.

## Near-term (low risk, additive)

### Type-mapping diagnostics pass
The `5.2.0` BigInt work added trace lines at three boundary points (`Connection::Query` operation params, `BoundDatumSet::unbind`, `BoundDatum::unbind`) and a single trace ran from `MSNODESQLV8_TEST_VERBOSE=true` was sufficient to pinpoint the failure that took several debug rounds to find by reasoning. We should systematise that.

Targets:
- **Bind dispatcher** — `bind_datum_type`, `user_bind`, `proc_bind` in `cpp/src/core/bound_datum.cpp`. One `SQL_LOG_TRACE_STREAM` per branch saying *"for value of JS type X / declared SQL type Y, routing to bind_Z"*.
- **Column construction** — the per-type sites in `cpp/src/odbc/odbc_statement_legacy.cpp` (`get_data_*`, `reserved_*`). Trace *"col idx N: SQL type → emitting Napi::T (mode=Native|String|BigInt)"*.
- **TVP per-column bind** — `BoundDatumSet::tvp` in `bound_datum_set.cpp`. Trace *"TVP col idx N got sql_type X over M rows"*.

All gated by `SQL_LOG_TRACE_STREAM` so SILENT level pays nothing. Goal: any future "wrong type to server" or "wrong type back to JS" support ticket diagnoses from one verbose trace log without a code-level repro.

### Alpine Linux prebuilds in CI
Currently produced locally from WSL because the GitHub Actions Linux runners don't ship with musl. Approach to consider:

- Add a matrix entry that runs `docker run --rm -v $PWD:/src node:<n>-alpine sh -c '...build...'` for each Node ABI we already publish.
- Stage the produced `prebuilds/<abi>-linuxmusl-x64/...` tarball as a release asset alongside the existing matrix.
- The build script invocation should match what we already do locally — same `binding.gyp`, same `node-gyp configure / build`. The only differential is the toolchain inside the alpine image (`apk add --no-cache python3 make g++ unixodbc-dev`).

Risk: low; we already trust the cross-ABI matrix. The only new failure mode is the alpine image drifting away from what consumers actually run, which we can constrain by pinning to specific tags and producing one row per supported Node major.

### Bulk-insert throughput regression (already on file)
`benchmark_findings.md` notes BCP at ~127k rows/s versus bulk array-bind collapsing to ~660 rows/s on realistic schemas (decimals + nullable nvarchar). Worth a focused investigation:

- Suspect: per-row binding overhead in `arrayPerColumnForCols` plus per-row C++ dispatch; arrays-of-arrays may be hitting a slow path inside `bind_w_var_char_array_bcp` vs `bind_w_var_char_array`.
- Approach: capture trace at TRACE level for a 1k-row bulk insert with a representative schema (some BCP-like, some decimal, some nvarchar nullable). Compare branch counts.

## Mid-term (moderate risk, structural)

### Gentle JS modernisation / TypeScript migration
The JS layer is battle-hardened but uneven — early-2010s patterns sit next to recent additions. Big-bang rewrite is wrong; one-module-at-a-time is right.

Suggested order (leaf first, core last):
1. `lib/util.js`, `lib/queue.js`, `lib/dialect.js` — pure helpers, easiest wins.
2. `lib/notifier.js`, `lib/reader.js` — small classes, well-bounded.
3. `lib/table-bulk-op-mgr.js`, `lib/procedure-bound.js`, `lib/procedure-meta.js` — feature modules, contained surface.
4. `lib/connection.js`, `lib/pool.js`, `lib/driver.js` — core, last because they're load-bearing.

Constraints:
- **Public API must not change.** `lib/index.d.ts` is the contract. TS rewrite emits to `lib/*.js` with the same shapes; the published package layout stays identical.
- **Keep CommonJS output.** `tsc --module commonjs --target es2020 --declaration` keeps consumers' `require()` working unchanged.
- **One module per PR.** Diff stays reviewable; regression scope is bounded.
- **Tests gate every step.** Existing suite + the new `bigint.test.js` already cover the core paths; extend rather than skip.

What we get: type safety inside the driver, fewer ad-hoc property bags, clearer contracts at module boundaries, IDE help for contributors. What we don't get: performance changes (output should be byte-identical for hot paths after `tsc`).

### Connection / statement state machine cleanup
`STATE_TRACKING_IMPLEMENTATION.md` documents the existing tracking. Worth revisiting once the trace work above lands — combined logging plus a clearer state diagram would make pause/cancel/timeout interactions easier to reason about. Low priority unless a support case forces it.

## Longer-term (broader scope, more thought required)

### Surface hidden ODBC features
There are knobs ODBC offers that we haven't exposed at the JS layer:

- **Server-side scrollable cursors** — `SQL_ATTR_CURSOR_TYPE = SQL_CURSOR_KEYSET_DRIVEN / SQL_CURSOR_DYNAMIC`. Useful for very large result sets where the consumer wants random access; today we always row-stream forward. Non-trivial because the JS reader contract assumes forward iteration.
- **SQLBulkOperations** — set-based update/delete on a result set without resending WHERE clauses. Could underpin a more efficient `bulkMgr.updateRows` for keyed updates.
- **Schema change / event notifications** — `SQL_ATTR_QUERY_NOTIFICATION_*`. Niche, but potentially useful for reactive consumers.
- **Always-Encrypted column metadata** — partly there; a programmatic way to inspect which columns are encrypted on a result set would help diagnostics.
- **Full-precision DECIMAL via `SQL_NUMERIC_STRUCT`** — analogous in spirit to the BigInt opt-in; today we collapse to `double` (or string under `useNumericString`). A `useDecimalAsString` per-column or per-query option would close the precision gap for `DECIMAL(38,n)` users without sweeping the entire result set.

Each of these is a focused PR with its own opt-in flag and test file (the BigInt PR is the template). None of them should be on by default in 5.x.

### Pool strategy revisit
`scalingStrategy` already supports `aggressive` / `gradual` / `exponential`. Worth profiling on real workloads (the inactivity-timeout interactions are subtle) and considering a `target-utilisation` strategy that scales based on observed concurrent-query load rather than connection count. Only if real users ask.

## Things we will NOT do (low value / high risk)

- **Default-flip BigInt to native in 6.0** is *plausible* but not committed. Consumers below `2^53` see no benefit and pay the `JSON.stringify` / arithmetic-mixing tax. Decision deferred until usage telemetry justifies it.
- **Rewriting C++ in a different language** (Rust talk surfaces periodically) — no. The C++ is the most stable layer and N-API gives us all the binding ergonomics we need. This would be churn for its own sake.
- **Dropping legacy ODBC driver support** — older driver versions are still in production at consumer sites. We add features behind capability checks, not by removing fallbacks.

## How to use this document

- Items here are candidates, not commitments. Pull one in when it has an owner and a concrete starting point.
- When something lands, move the bullet from this file into the appropriate release notes and delete it here.
- New ideas welcome — keep entries short (one paragraph + a "why now / why not") so the document stays scannable.
