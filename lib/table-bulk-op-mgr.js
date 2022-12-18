const util = require('util')

class BulkPromises {
  constructor (bulk) {
    this.insert = util.promisify(bulk.insertRows)
    this.delete = util.promisify(bulk.deleteRows)
    this.select = util.promisify(bulk.selectRows)
    this.update = util.promisify(bulk.updateRows)
  }
}

class TableBulkOpMgr {
  constructor (theConnection, user, m) {
    const meta = m

    let batch = 0
    let usetMetaType = true
    let summary = meta.getSummary()
    let bcp = false
    let bcpVersion = 17

    // if utc is off, we switch to using metadata from table columns
    // and on date related columns, the local timezone offset is sent
    // to driver to offset the UTC timestamp - giving ability to write local
    // dates into the database.
    useMetaType(true)

    function asTableType (name) {
      const summary = meta.getSummary()
      const columns = summary.columns

      if (!name) {
        name = `${columns[0].table_name}Type`
      }
      const cols = userTypeCols(name)
      return new user.Table(name, cols)
    }

    function keys (vec) {
      return vec.map(elem => {
        return meta.primaryCols.reduce(function (obj, column) {
          if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
            obj[column.name] = elem[column.name]
          }
          return obj
        }, {})
      })
    }

    function userTypeCols () {
      const summary = meta.getSummary()
      const useUTC = theConnection.getUseUTC()
      return summary.columns.map(c => c.asUserType(useUTC))
    }

    function asUserType (name) {
      const summary = meta.getSummary()
      const columns = summary.columns
      const cols = userTypeCols()
      const declarations = cols.map(c => `${c.name} ${c.userType}`).join(', ')
      // CREATE TYPE TestType AS TABLE ( a VARCHAR(50), b INT );

      if (!name) {
        name = `${columns[0].table_name}Type`
      }
      return `CREATE TYPE ${name} AS TABLE (${declarations})`
    }

    // create an object of arrays where each array represents all values
    // for the batch.

    function prepare () {
      return summary.columns.reduce((agg, col) => {
        const property = col.name
        if (Object.prototype.hasOwnProperty.call(summary.by_name, property) &&
          !summary.by_name[property].isReadOnly()) {
          agg.keys.push(property)
          if (!Object.prototype.hasOwnProperty.call(agg.arrays_by_name, property)) {
            agg.arrays_by_name[property] = []
          }
        }
        return agg
      }, {
        keys: [],
        arrays_by_name: {}
      })
    }

    function arrayPerColumn (vec) {
      const res = prepare()
      vec.forEach(instance => {
        res.keys.reduce((agg, property) => {
          const columnValues = agg[property]
          const val = Object.prototype.hasOwnProperty.call(instance, property)
            ? instance[property]
            : null
          columnValues.push(val)
          return agg
        }, res.arrays_by_name)
      })

      return res
    }

    // if batch size is set, split the input into that batch size.

    function rowBatches (rows) {
      const batches = []
      if (batch === 0) {
        batches.push(rows)
      } else {
        let singleBatch = []
        for (let i = 0; i < rows.length; i += 1) {
          singleBatch.push(rows[i])
          if (singleBatch.length === batch) {
            batches.push(singleBatch)
            singleBatch = []
          }
        }
      }

      return batches
    }

    // driver will have to recognise this is an array of arrays where each array
    // represents all values for that particular column.

    function arrayPerColumnForCols (rows, colSubSet, usebcp) {
      const dataColsByName = arrayPerColumn(rows).arrays_by_name
      return colSubSet.reduce((agg, col) => {
        if (Object.prototype.hasOwnProperty.call(dataColsByName, col.name)) {
          const valueVector = dataColsByName[col.name]
          if (usetMetaType && meta.hasColumn(col.name)) {
            const declaration = meta.colByName[col.name]
            agg.push({
              value: valueVector,
              offset: declaration.offset || 0,
              sql_type: declaration.sql_type,
              precision: declaration.precision,
              scale: declaration.scale,
              bcp: usebcp,
              bcp_version: bcpVersion,
              ordinal_position: col.ordinal_position,
              table_name: usebcp ? meta.bcpTableName : ''
            })
          } else {
            agg.push(valueVector)
          }
        }
        return agg
      }, [])
    }

    // given the input array of asObjects consisting of potentially all columns, strip out
    // the sub set corresponding to the where column set.

    function whereForRowsNoBatch (sql, rows, callback) {
      const colArray = arrayPerColumnForCols(rows, summary.whereColumns)
      theConnection.query(sql, colArray, callback)
    }

    function selectRows (rows, callback) {
      const res = []
      whereForRowsNoBatch(summary.selectSignature, rows, (err, results, more) => {
        results.forEach(r => {
          res.push(r)
        })
        if (!more) {
          callback(err, res)
        }
      })
    }

    function runQuery (sql, colArray) {
      return new Promise((resolve, reject) => {
        theConnection.query(sql, colArray, (e, res) => {
          if (e) {
            reject(e)
          } else {
            resolve(res)
          }
        })
      })
    }

    function batchIterator (sql, rows, iterate) {
      return Promise.all(rowBatches(rows).map(b => runQuery(sql, iterate(b))))
    }

    function insertRows (rows, callback) {
      batchIterator(summary.insertSignature, rows, b => arrayPerColumnForCols(b, summary.assignableColumns, bcp))
        .then(res => {
          callback(null, res)
        }).catch(e => callback(e, null))
    }

    function updateRows (rows, callback) {
      batchIterator(summary.updateSignature, rows, b => arrayPerColumnForCols(b, summary.updateColumns, false).concat(arrayPerColumnForCols(b, summary.whereColumns)))
        .then(res => {
          callback(null, res)
        }).catch(e => callback(e, null))
    }

    function deleteRows (rows, callback) {
      batchIterator(summary.deleteSignature, rows, b => arrayPerColumnForCols(b, summary.whereColumns, false))
        .then(res => {
          callback(null, res)
        }).catch(e => callback(e, null))
    }

    function getMeta () {
      return meta
    }

    function setBatchSize (batchSize) {
      batch = batchSize
    }

    function setWhereCols (whereCols) {
      meta.setWhereCols(whereCols)
      summary = meta.getSummary()
    }

    function setUpdateCols (updateCols) {
      meta.setUpdateCols(updateCols)
      summary = meta.getSummary()
    }

    function getSummary () {
      return meta.getSummary()
    }

    // insert only
    function setUseBcp (v) {
      bcp = v
      if (bcp) {
        this.useMetaType(true)
      }
    }

    function setBcpVersion (v) {
      bcpVersion = v
    }

    function getBcpVersion () {
      return bcpVersion
    }

    function getUseBcp () {
      return bcp
    }

    function useMetaType (v) {
      usetMetaType = v
    }

    // public api

    this.useMetaType = useMetaType
    this.asTableType = asTableType
    this.asUserType = asUserType

    this.insertRows = insertRows
    this.selectRows = selectRows
    this.deleteRows = deleteRows
    this.updateRows = updateRows

    this.setBatchSize = setBatchSize
    this.setWhereCols = setWhereCols
    this.setUpdateCols = setUpdateCols
    this.getMeta = getMeta
    this.meta = meta
    this.columns = meta.getAllColumns()
    this.getSummary = getSummary
    this.setUseBcp = setUseBcp
    this.getUseBcp = getUseBcp
    this.setBcpVersion = setBcpVersion
    this.getBcpVersion = getBcpVersion
    this.keys = keys
    this.promises = new BulkPromises(this)
  }
}

exports.TableBulkOpMgr = TableBulkOpMgr
