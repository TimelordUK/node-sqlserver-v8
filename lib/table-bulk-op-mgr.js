'use strict'

const { BasePromises } = require('./base-promises')
class BulkPromises extends BasePromises {
  constructor (bulk) {
    super()
    this.bulk = bulk
  }

  async insert (rows) {
    return this.op(cb => this.bulk.insertRows(rows, cb))
  }

  async delete (rows) {
    return this.op(cb => this.bulk.deleteRows(rows, cb))
  }

  async select (rows) {
    return this.op(cb => this.bulk.selectRows(rows, cb))
  }

  async update (rows) {
    return this.op(cb => this.bulk.updateRows(rows, cb))
  }
}

class TableTypedParam {
  constructor (col, valueVector, usebcp, bcpVersion, tableName) {
    this.value = valueVector
    this.offset = col.offset || 0
    this.sql_type = col.sql_type
    this.precision = col.precision
    this.scale = col.scale
    this.bcp = usebcp
    this.bcp_version = bcpVersion
    this.ordinal_position = col.ordinal_position
    this.table_name = usebcp ? tableName : ''
  }
}

class TableBulkOpMgr {
  constructor (theConnection, user, m) {
    this.user = user
    this.theConnection = theConnection
    this.meta = m
    this.batch = 0
    this.usetMetaType = true
    this.summary = this.meta.getSummary()
    this.bcp = false
    this.bcpVersion = 17
    this.promises = new BulkPromises(this)
    // node_mssql JS lib requires this poperty from meta
    this.columns = this.meta.cols
    this.useMetaType(true)
  }

  // if utc is off, we switch to using metadata from table columns
  // and on date related columns, the local timezone offset is sent
  // to driver to offset the UTC timestamp - giving ability to write local
  // dates into the database.

  asTableType (name) {
    const summary = this.meta.getSummary()
    const columns = summary.columns

    if (!name) {
      name = `${columns[0].table_name}Type`
    }
    const cols = this.userTypeCols(name)
    return new this.user.Table(name, cols)
  }

  keys (vec) {
    return vec.map(elem => this.meta.extractKeys(elem))
  }

  userTypeCols () {
    const summary = this.meta.getSummary()
    const useUTC = this.theConnection.getUseUTC()
    return summary.columns.map(c => c.asUserType(useUTC))
  }

  asUserType (name) {
    const summary = this.meta.getSummary()
    const columns = summary.columns
    const cols = this.userTypeCols()
    const declarations = cols.map(c => `${c.name} ${c.userType}`).join(', ')
    // CREATE TYPE TestType AS TABLE ( a VARCHAR(50), b INT );

    if (!name) {
      name = `${columns[0].table_name}Type`
    }
    return `CREATE TYPE ${name} AS TABLE (${declarations})`
  }

  // create an object of arrays where each array represents all values
  // for the batch.

  prepare () {
    const names = this.meta.assignableColumnNames
    const vecs = names.reduce((agg, name) => {
      agg[name] = []
      return agg
    }, {})
    return {
      keys: names,
      arrays_by_name: vecs
    }
  }

  deconstructToArrays (res, instance) {
    res.keys.reduce((agg, property) => {
      const columnValues = agg[property]
      const val = this.hasProp(instance, property)
        ? instance[property]
        : null
      columnValues.push(val)
      return agg
    }, res.arrays_by_name)
  }

  arrayPerColumn (vec) {
    const res = this.prepare()
    vec.forEach(instance => { this.deconstructToArrays(res, instance) })
    return res
  }

  // if batch size is set, split the input into that batch size.

  rowBatches (rows) {
    const batches = []
    if (this.batch === 0) {
      batches.push(rows)
    } else {
      rows.reduce((agg, c, i) => {
        if (i % this.batch === 0) {
          agg.push([])
        }
        const latest = agg[agg.length - 1]
        latest.push(c)
        return agg
      }, batches)
    }

    return batches
  }

  // driver will have to recognise this is an array of arrays where each array
  // represents all values for that particular column.

  hasProp (parent, name) {
    return Object.prototype.hasOwnProperty.call(parent, name)
  }

  arrayPerColumnForCols (rows, colSubSet, usebcp) {
    const dataColsByName = this.arrayPerColumn(rows).arrays_by_name
    return colSubSet.reduce((agg, col) => {
      if (this.hasProp(dataColsByName, col.name)) {
        const valueVector = dataColsByName[col.name]
        const v = this.usetMetaType
          ? new TableTypedParam(col, valueVector, usebcp, this.bcpVersion, this.meta.bcpTableName)
          : valueVector
        agg.push(v)
      }
      return agg
    }, [])
  }

  // given the input array of asObjects consisting of potentially all columns, strip out
  // the sub set corresponding to the where column set.

  async batchIterator (sql, rows, iterate) {
    return Promise
      .all(this.rowBatches(rows)
        .map(b => this.theConnection.promises.query(sql, iterate(b))))
  }

  runOp (rows, signature, cols, bcp, callback) {
    this.runOp2(rows, signature, cols, null, bcp, callback)
  }

  runOp2 (rows, signature, cols, cols2, bcp, callback) {
    this.batchIterator(signature, rows, b =>
      cols2
        ? this.arrayPerColumnForCols(b, cols, false)
          .concat(this.arrayPerColumnForCols(b, cols2))
        : this.arrayPerColumnForCols(b, cols, false))
      .then(res => {
        callback(null, res)
      }).catch(e => callback(e, null))
  }

  insertRows (rows, callback) {
    this.runOp(rows, this.summary.insertSignature, this.summary.assignableColumns, this.bcp, callback)
  }

  deleteRows (rows, callback) {
    this.runOp(rows, this.summary.deleteSignature, this.summary.assignableColumns, false, callback)
  }

  updateRows (rows, callback) {
    this.runOp2(rows, this.summary.updateSignature,
      this.summary.updateColumns, this.summary.whereColumns, false, callback)
  }

  selectRows (rows, callback) {
    const res = []
    const colArray = this.arrayPerColumnForCols(rows, this.summary.whereColumns)
    this.theConnection.query(this.summary.selectSignature, colArray, (err, results, more) => {
      res.push(results)
      if (!more) {
        const flattened = res.flatMap(v => v)
        callback(err, flattened)
      }
    })
  }

  getMeta () {
    return this.meta
  }

  setBatchSize (batchSize) {
    this.batch = batchSize
  }

  setWhereCols (whereCols) {
    this.meta.setWhereCols(whereCols)
    this.summary = this.meta.getSummary()
  }

  setUpdateCols (updateCols) {
    this.meta.setUpdateCols(updateCols)
    this.summary = this.meta.getSummary()
  }

  getSummary () {
    return this.meta.getSummary()
  }

  // insert only
  setUseBcp (v) {
    this.bcp = v
    if (this.bcp) {
      this.useMetaType(true)
    }
  }

  setBcpVersion (v) {
    this.bcpVersion = v
  }

  getBcpVersion () {
    return this.bcpVersion
  }

  getUseBcp () {
    return this.bcp
  }

  useMetaType (v) {
    this.usetMetaType = v
  }
}

exports.TableBulkOpMgr = TableBulkOpMgr
