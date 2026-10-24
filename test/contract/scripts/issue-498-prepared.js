'use strict'

// #498 through a prepared statement: with numeric strings on at prepare, numeric and decimal
// result columns are bound as text, so they keep every digit, as a query's do. several rows,
// so each row's text is read from its own place in the bound array; a null, values below 1,
// money, next to a query of the same rows; and the same statement prepared with numeric strings off still reads numbers.

const ROWS = "(1, 1.0123456789, 12345678901234567.89, 922337203685477.5807, 1e-10), " +
  '(2, -0.5, 0, -0.0001, -2.5), (3, null, null, null, null), (4, 0.0000001, 5, 1.2345, 1.5e300)'

module.exports = async t => {
  t.query('setup', 'create table #p (i int, n numeric(38,10), d decimal(38,2), m money, f float); ' +
    `insert #p values ${ROWS}`, null, { callback: true })
  await t.settled('setup')
  // what a query gives for the same rows: the prepared statement should read the same
  t.section('query, numeric strings on')
  t.query('query', { query_str: 'select i, n, d, m, f from #p where i >= 1 order by i', numeric_string: true }, null, { columns: true })
  await t.settled('query')
  for (const numericString of [true, false]) {
    const label = numericString ? 'ps-ns' : 'ps'
    const ps = await new Promise((resolve, reject) => {
      t.conn.prepare({ query_str: 'select i, n, d, m, f from #p where i >= ? order by i', numeric_string: numericString },
        (err, p) => err ? reject(err) : resolve(p))
    })
    t.section(`prepared, numeric strings ${numericString ? 'on' : 'off'}`)
    t.watch(label, ps.preparedQuery([1]), { columns: true })
    await t.next(label, 'done')
    await new Promise(resolve => ps.free(resolve))
  }
}
