'use strict'

// #498 through a prepared statement: it binds numeric, decimal and float result columns as a
// double, so under numeric strings numeric and decimal lose what a double cannot hold.

module.exports = async t => {
  t.query('setup', 'create table #p (n numeric(38,10), d decimal(38,2), f float); ' +
    'insert #p values (1.0123456789, 12345678901234567.89, 1e-10)', null, { callback: true })
  await t.settled('setup')
  const ps = await new Promise((resolve, reject) => {
    t.conn.prepare({ query_str: 'select n, d, f from #p where 1 = ?', numeric_string: true },
      (err, p) => err ? reject(err) : resolve(p))
  })
  t.section('prepared, numeric strings on')
  t.watch('ps', ps.preparedQuery([1]), { columns: true })
  await t.next('ps', 'done')
  await new Promise(resolve => ps.free(resolve))
}
