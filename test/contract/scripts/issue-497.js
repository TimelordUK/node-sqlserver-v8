'use strict'

// #497: a sql_variant column's values were all read as the first row's base type, so later
// values came back truncated (1.5 as 1), as another type, as an error, or crashed the
// process when a failed cell was followed by another. each case is one variant column
// starting with one base type and followed by all the others, read next to a key column
// (select i, v: the shape that crashed). a NULL in the last row is read too.

const VALUES = {
  int: 'cast(7 as int)',
  bigint: 'cast(9223372036854775807 as bigint)',
  decimal: 'cast(1.5 as decimal(5,2))',
  float: 'cast(2.25e-9 as float)',
  nvarchar: "cast(N'abc' as nvarchar(10))",
  datetime: "cast('2020-01-02' as datetime)",
  bit: 'cast(1 as bit)',
  null: 'null'
}

const column = first => {
  const values = [VALUES[first], ...Object.entries(VALUES).filter(([k]) => k !== first).map(([, v]) => v)]
  return 'select i, v from (values ' +
    values.map((x, i) => `(${i + 1}, cast(${x} as sql_variant))`).join(', ') +
    ') t(i, v) order by i'
}

// numeric strings off here, on in issue-497-ns: both in one transcript pass its 400 lines
const run = numericString => async t => {
  for (const first of Object.keys(VALUES)) {
    const label = `${first}${numericString ? '-ns' : ''}`
    t.section(`${first} first, numeric strings ${numericString ? 'on' : 'off'}`)
    t.query(label, { query_str: column(first), numeric_string: numericString, bigint_as_native: true }, null, { columns: true })
    await t.settled(label)
  }
}

module.exports = run(false)
module.exports.run = run
