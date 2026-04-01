/* eslint-disable */
// ---------------------------------------------------------------------------
// Smoke test: Paged stored-procedure call with pause/resume lifecycle.
//
// Reproduces the crash scenario from issue #389 where a stored procedure
// returning a small result set is consumed with pause/resume paging, and
// the process crashes with 0xC0000005 (EXCEPTION_ACCESS_VIOLATION) during
// teardown or immediately after the last row is dispatched.
//
// The script is self-contained: it creates a temp table and stored procedure,
// inserts test data, then exercises the pause/resume lifecycle repeatedly.
//
// Usage:
//   node samples/javascript/paged-procedure-pause-resume.js
//
// Environment variables:
//   LINUX / DEFAULT   — connection string override (same as test suite)
//   ITERATIONS        — number of full open/query/close cycles (default: 5)
//   PAGE_SIZE         — rows per JS page (default: 2)
//   PROC_PAGE_SIZE    — @PageSize parameter to the stored procedure (default: 4)
//   DEBUG             — set to 1 for verbose tracing
// ---------------------------------------------------------------------------

'use strict'

const sql = require('../../lib/sql')
const { TestEnv } = require('../../test/env/test-env')

// ── configuration ──────────────────────────────────────────────────────────

const env = new TestEnv()
const connectionString = env.connectionString

const ITERATIONS = parseInt(process.env.ITERATIONS || '5', 10)
const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || '2', 10)
const PROC_PAGE_SIZE = parseInt(process.env.PROC_PAGE_SIZE || '4', 10)
const DEBUG = process.env.DEBUG === '1'

function trace (msg) {
  if (DEBUG) process.stdout.write(`[SMOKE] ${msg}\n`)
}

// ── helpers ────────────────────────────────────────────────────────────────

function queryPromise (conn, q) {
  return new Promise((resolve, reject) => {
    conn.query(q, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function openPromise () {
  return new Promise((resolve, reject) => {
    sql.open(connectionString, (err, conn) => {
      if (err) reject(err)
      else resolve(conn)
    })
  })
}

function closePromise (conn) {
  return new Promise((resolve, reject) => {
    conn.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// ── database setup (uses the opened connection) ────────────────────────────

const tableName = '#PagedProcSmokeTest'
const procName = 'sp_PagedProcSmokeTest'

async function setupDatabase (conn) {
  // Create temp table
  await queryPromise(conn, `
    CREATE TABLE ${tableName} (
      ID BIGINT IDENTITY(1,1) PRIMARY KEY,
      Stamp DATETIME2(3) NOT NULL,
      Val   INT NOT NULL
    )
  `)
  trace('created temp table')

  // Insert enough rows — we use 20 so there are several pages
  const rows = []
  for (let i = 0; i < 20; i++) {
    rows.push(`('2024-01-01T00:00:${String(i).padStart(2, '0')}.000', ${i * 10})`)
  }
  await queryPromise(conn, `
    INSERT INTO ${tableName} (Stamp, Val) VALUES ${rows.join(', ')}
  `)
  trace(`inserted ${rows.length} rows`)

  // Create stored procedure
  // Drop first if it exists (not a temp proc so survives across connections)
  await queryPromise(conn, `
    IF OBJECT_ID('${procName}', 'P') IS NOT NULL DROP PROCEDURE ${procName}
  `)
  await queryPromise(conn, `
    CREATE PROCEDURE ${procName}
      @Offset INT,
      @PageSize INT
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT ID, Stamp, Val
      FROM ${tableName}
      ORDER BY ID
      OFFSET @Offset ROWS
      FETCH NEXT @PageSize ROWS ONLY;
    END
  `)
  trace('created stored procedure')
}

// ── paged query with pause/resume ──────────────────────────────────────────

function runPagedProcedure (conn, offset, pageSize) {
  return new Promise((resolve, reject) => {
    const pm = conn.procedureMgr()
    pm.setTimeout(30)

    pm.getProc(procName, (err, procedure) => {
      if (err) return reject(err)

      const args = [sql.Int(offset).value, sql.Int(pageSize).value]
      trace(`calling ${procName}(@Offset=${offset}, @PageSize=${pageSize})`)
      const q = procedure.call(args)

      let meta = null
      let currentRow = {}
      let lastColumn = 0
      const bufferedRows = []
      let completedRowCount = 0
      let done = false
      let errored = false

      q.on('meta', (m) => {
        meta = m
        currentRow = {}
        lastColumn = m.length - 1
        trace(`meta: ${m.length} columns`)
      })

      q.on('column', (index, data) => {
        if (!meta) return
        const name = meta[index]?.name || `col_${index}`
        currentRow[name] = data

        if (index !== lastColumn) return

        // row complete
        const row = currentRow
        currentRow = {}
        bufferedRows.push(row)
        completedRowCount++
        trace(`row ${completedRowCount - 1}: ${JSON.stringify(row)}`)

        // pause after accumulating PAGE_SIZE + 1 rows (sentinel-based paging)
        if (PAGE_SIZE > 1 &&
            bufferedRows.length >= PAGE_SIZE + 1 &&
            !q.isPaused()) {
          trace(`pausing at buffered=${bufferedRows.length}`)
          q.pauseQuery()
        }
      })

      q.on('done', () => {
        trace('query done event')
        done = true
        // drain any remaining buffered rows
        finish()
      })

      q.on('error', (e) => {
        trace(`query error: ${e}`)
        errored = true
        reject(e)
      })

      q.on('free', () => {
        trace('query free event')
      })

      // consume pages
      const allRows = []

      function consumePage () {
        const page = bufferedRows.splice(0, PAGE_SIZE)
        allRows.push(...page)
        trace(`consumed page of ${page.length} rows, total=${allRows.length}, buffered=${bufferedRows.length}`)
      }

      function finish () {
        // drain remaining buffer
        while (bufferedRows.length > 0) {
          consumePage()
        }
        if (!errored) {
          resolve(allRows)
        }
      }

      function tryResume () {
        if (done || errored) {
          finish()
          return
        }
        if (bufferedRows.length >= PAGE_SIZE + 1) {
          // have a full page + sentinel — consume and resume
          consumePage()
          trace(`resuming query`)
          q.resumeQuery()
          // schedule next check
          setImmediate(tryResume)
        } else if (q.isPaused()) {
          // paused but not enough rows buffered yet — resume to get more
          trace(`resuming query (need more rows)`)
          q.resumeQuery()
          setImmediate(tryResume)
        } else {
          // still streaming, wait a tick
          setImmediate(tryResume)
        }
      }

      // start consuming once first pause happens (or done fires)
      const pollStart = () => {
        if (done) {
          finish()
        } else if (q.isPaused() || bufferedRows.length >= PAGE_SIZE + 1) {
          tryResume()
        } else {
          setImmediate(pollStart)
        }
      }
      setImmediate(pollStart)
    })
  })
}

// ── aggressive close variant ───────────────────────────────────────────────
// Mimics the user's repro: calls conn.close() immediately after resume,
// without waiting for the done/free events. This tests the race between
// the native cleanup path (nextResult/unbind/release) and connection close.

function runPagedProcedureWithEarlyClose (conn, offset, pageSize) {
  return new Promise((resolve, reject) => {
    const pm = conn.procedureMgr()
    pm.setTimeout(30)

    pm.getProc(procName, (err, procedure) => {
      if (err) return reject(err)

      const args = [sql.Int(offset).value, sql.Int(pageSize).value]
      trace(`[early-close] calling ${procName}(@Offset=${offset}, @PageSize=${pageSize})`)
      const q = procedure.call(args)

      let meta = null
      let currentRow = {}
      let lastColumn = 0
      const bufferedRows = []
      let completedRowCount = 0
      let queryDone = false

      q.on('meta', (m) => {
        meta = m
        currentRow = {}
        lastColumn = m.length - 1
      })

      q.on('column', (index, data) => {
        if (!meta) return
        const name = meta[index]?.name || `col_${index}`
        currentRow[name] = data
        if (index !== lastColumn) return
        const row = currentRow
        currentRow = {}
        bufferedRows.push(row)
        completedRowCount++
        if (PAGE_SIZE > 1 && bufferedRows.length >= PAGE_SIZE + 1 && !q.isPaused()) {
          q.pauseQuery()
        }
      })

      q.on('done', () => { queryDone = true })
      q.on('error', () => { queryDone = true })

      // After first pause, consume one page, resume, then immediately close
      const pollStart = () => {
        if (queryDone) {
          resolve(bufferedRows)
          return
        }
        if (q.isPaused() || bufferedRows.length >= PAGE_SIZE + 1) {
          // consume first page
          bufferedRows.splice(0, PAGE_SIZE)
          trace(`[early-close] consumed page, resuming and immediately closing`)
          q.resumeQuery()
          // immediately close without waiting for done — this is the aggressive pattern
          setImmediate(() => {
            closePromise(conn).then(() => {
              trace(`[early-close] connection closed`)
              resolve(bufferedRows)
            }).catch(reject)
          })
        } else {
          setImmediate(pollStart)
        }
      }
      setImmediate(pollStart)
    })
  })
}

// ── main ───────────────────────────────────────────────────────────────────

async function main () {
  process.stdout.write(`[SMOKE] paged-procedure-pause-resume smoke test\n`)
  process.stdout.write(`[SMOKE] connection: ${connectionString.substring(0, 60)}...\n`)
  process.stdout.write(`[SMOKE] iterations=${ITERATIONS} pageSize=${PAGE_SIZE} procPageSize=${PROC_PAGE_SIZE}\n\n`)

  let failures = 0

  // Test 1: Normal lifecycle (wait for done before close)
  process.stdout.write(`[SMOKE] === Test 1: Normal pause/resume lifecycle ===\n`)
  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`[SMOKE] iteration ${i}/${ITERATIONS} ... `)
    let conn
    try {
      conn = await openPromise()
      await setupDatabase(conn)

      const rows = await runPagedProcedure(conn, 0, PROC_PAGE_SIZE)
      process.stdout.write(`OK (${rows.length} rows)\n`)
      trace(`rows: ${JSON.stringify(rows)}`)

      if (rows.length !== PROC_PAGE_SIZE) {
        process.stdout.write(`  WARNING: expected ${PROC_PAGE_SIZE} rows, got ${rows.length}\n`)
      }

      await closePromise(conn)
      conn = null
    } catch (err) {
      failures++
      process.stdout.write(`FAILED\n`)
      process.stderr.write(`  error: ${err.stack || err}\n`)
      if (conn) {
        try { await closePromise(conn) } catch (_) { /* ignore */ }
      }
    }
  }

  // Test 2: Aggressive close (close during async gap after resume)
  process.stdout.write(`\n[SMOKE] === Test 2: Aggressive close after resume ===\n`)
  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`[SMOKE] iteration ${i}/${ITERATIONS} ... `)
    let conn
    try {
      conn = await openPromise()
      await setupDatabase(conn)

      await runPagedProcedureWithEarlyClose(conn, 0, PROC_PAGE_SIZE)
      process.stdout.write(`OK\n`)
      conn = null // already closed in the function
    } catch (err) {
      failures++
      process.stdout.write(`FAILED\n`)
      process.stderr.write(`  error: ${err.stack || err}\n`)
    }
  }

  // Test 3: Different page sizes to exercise various pause points
  process.stdout.write(`\n[SMOKE] === Test 3: Various page sizes ===\n`)
  for (const ps of [1, 2, 3, 5, 10]) {
    process.stdout.write(`[SMOKE] pageSize=${ps}, procPageSize=8 ... `)
    let conn
    try {
      conn = await openPromise()
      await setupDatabase(conn)
      const rows = await runPagedProcedure(conn, 0, 8)
      process.stdout.write(`OK (${rows.length} rows)\n`)
      await closePromise(conn)
      conn = null
    } catch (err) {
      failures++
      process.stdout.write(`FAILED\n`)
      process.stderr.write(`  error: ${err.stack || err}\n`)
      if (conn) {
        try { await closePromise(conn) } catch (_) { /* ignore */ }
      }
    }
  }

  process.stdout.write(`\n[SMOKE] summary: ${(ITERATIONS * 2 + 5) - failures}/${ITERATIONS * 2 + 5} passed, ${failures} failed\n`)
  if (failures > 0) {
    process.exitCode = 1
  }
}

process.on('unhandledRejection', (err) => {
  process.stderr.write(`[SMOKE] unhandledRejection: ${err.stack || err}\n`)
})

process.on('uncaughtException', (err) => {
  process.stderr.write(`[SMOKE] uncaughtException: ${err.stack || err}\n`)
  process.exitCode = 1
})

main().catch((err) => {
  process.stderr.write(`[SMOKE] fatal: ${err.stack || err}\n`)
  process.exitCode = 1
})
