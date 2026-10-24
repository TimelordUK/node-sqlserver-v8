'use strict'
// #497: sql_variant rows read as the first row's base type.
//   node i497.js         wrong-data cases (numeric strings off and on)
//   node i497.js crash   the case that killed the process (0xC0000005)
const { sql, cs, version } = require('./common')
const variantColumn = (cols, ...values) =>
  `select ${cols} from (values ` +
  values.map((x, i) => `(${i + 1}, cast(${x} as sql_variant))`).join(', ') +
  ') t(i, v) order by i'
const cases = {
  'int, decimal': variantColumn('v', 'cast(7 as int)', 'cast(1.5 as decimal(5,2))'),
  'int, nvarchar': variantColumn('v', 'cast(7 as int)', "cast(N'abc' as nvarchar(10))"),
  'datetime, int': variantColumn('v', "cast('2020-01-02' as datetime)", 'cast(7 as int)'),
  'NULL, int, nvarchar, numeric': variantColumn('v', 'null', '1', "N'abc'", '1.5'),
  'float, bigint': variantColumn('v', 'cast(2.25e-9 as float)', 'cast(9223372036854775807 as bigint)'),
  'bit, int': variantColumn('v', 'cast(1 as bit)', 'cast(7 as int)')
}
const crashes = {
  'mix of five': variantColumn('v', '1', "N'abc'", '1.5', 'cast(9223372036854775807 as bigint)', '2.25e-9'),
  'i, v int nvarchar': variantColumn('i, v', 'cast(7 as int)', "cast(N'abc' as nvarchar(10))"),
  'int nvarchar int': variantColumn('v', 'cast(7 as int)', "cast(N'abc' as nvarchar(10))", 'cast(8 as int)')
}
const run = (conn, query, numericString) => new Promise(resolve => {
  conn.queryRaw({ query_str: query, numeric_string: numericString, bigint_as_native: true },
    (err, res) => resolve(err ? `error ${err.sqlstate} ${err.message}` : res.rows.map(r => r[r.length - 1])))
})
sql.open(cs, async (err, conn) => {
  if (err) throw err
  const which = process.argv[2] === 'crash' ? crashes : cases
  for (const ns of [false, true]) {
    for (const [name, query] of Object.entries(which)) {
      console.log(version, `ns=${ns}`, name, await run(conn, query, ns))
    }
  }
  conn.close(() => {})
})
