'use strict'
// #498: numeric_string prints float, real, decimal and money with %f.
const { sql, cs, version } = require('./common')
const query = `select
  cast(0.1234567890123 as float)                 as f1,
  cast(1e-10 as float)                           as f2,
  cast(1.5e300 as float)                         as f3,
  cast(0.12345678 as real)                       as r1,
  cast(1.0123456789 as decimal(38,10))           as d1,
  cast(12345678901234567890.12 as decimal(38,2)) as d2,
  cast(0.0000001 as decimal(10,7))               as d3,
  cast(9007199254740993 as decimal(19,0))        as d4,
  cast(709 as decimal(10,0))                     as d5,
  cast(922337203685477.5807 as money)            as m1,
  cast(-0.0001 as money)                         as m2,
  cast(1.2345 as smallmoney)                     as sm1,
  cast(1.0123456789 as numeric(38,10))           as n1`
const show = res => res.meta.map((m, i) => `${m.name}=${JSON.stringify(res.rows[0][i])}`).join(' ')
sql.open(cs, async (err, conn) => {
  if (err) throw err
  for (const ns of [false, true]) {
    const res = await new Promise((resolve, reject) =>
      conn.queryRaw({ query_str: query, numeric_string: ns }, (e, r) => e ? reject(e) : resolve(r)))
    console.log(version, `ns=${ns}`, show(res))
  }
  await new Promise((resolve, reject) => conn.query(
    'create table #p (n1 numeric(38,10), d2 numeric(38,2)); insert #p values (1.0123456789, 12345678901234567.89)',
    e => e ? reject(e) : resolve()))
  const ps = await new Promise((resolve, reject) =>
    conn.prepare({ query_str: 'select n1, d2 from #p where 1 = ?', numeric_string: true },
      (e, p) => e ? reject(e) : resolve(p)))
  const pres = await new Promise((resolve, reject) =>
    ps.preparedQuery([1], (e, r) => e ? reject(e) : resolve(r)))
  console.log(version, 'prepared ns=true', JSON.stringify(pres))
  ps.free(() => conn.close(() => {}))
})
