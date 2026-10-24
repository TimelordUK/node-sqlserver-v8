'use strict'

// #498: under numeric strings, float, real, decimal and money were printed with %f (six
// decimal places, no exponent): 1e-10 came back as "0.000000". each value is read with
// numeric strings off and on; the strings should keep the value. decimal and money are the
// driver's exact text, as numeric is. prepared statements: issue-498-prepared.

const VALUES = [
  'cast(0.1234567890123 as float)',
  'cast(1e-10 as float)',
  'cast(1.5e300 as float)',
  'cast(-2.5 as float)',
  'cast(0.12345678 as real)',
  'cast(1.0123456789 as decimal(38,10))',
  'cast(12345678901234567890.12 as decimal(38,2))',
  'cast(0.0000001 as decimal(10,7))',
  'cast(9007199254740993 as decimal(19,0))',
  'cast(709 as decimal(10,0))',
  'cast(922337203685477.5807 as money)',
  'cast(-0.0001 as money)',
  'cast(1.2345 as smallmoney)',
  'cast(1.0123456789 as numeric(38,10))',
  'cast(0.0000001 as numeric(10,7))',
  'cast(9223372036854775807 as bigint)'
]
const SELECT = 'select ' + VALUES.map((v, i) => `${v} as c${i}`).join(', ')

module.exports = async t => {
  t.note(VALUES.map((v, i) => `c${i} ${v}`).join('; '))
  for (const numericString of [false, true]) {
    const label = numericString ? 'ns' : 'plain'
    t.section(`numeric strings ${numericString ? 'on' : 'off'}`)
    t.query(label, { query_str: SELECT, numeric_string: numericString }, null, { columns: true })
    await t.settled(label)
  }

}
