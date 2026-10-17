'use strict'

// #480: pausing on the last row of a result set's final batch skipped the next result set.
// dhensby's repro: two result sets of 51 rows (a batch of 50, then one of 1), paused for
// 50 ms at rows 50, 51 and 52. every run should give both result sets, 51 rows each.

const TWO_51 = 'select top 51 object_id as a from sys.all_objects; select top 51 object_id as b from sys.all_objects'

module.exports = async t => {
  for (const at of [50, 51, 52]) {
    const label = `at${at}`
    t.section(`pause at row ${at}, resume 50 ms later`)
    t.query(label, TWO_51, null, { at: { row: { [at]: ['pause', 'resume:50'] } } })
    await t.settled(label)
  }
}
