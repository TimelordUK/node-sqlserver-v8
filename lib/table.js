/**
 * Created by Stephen on 9/28/2015.
 */

/*
 supports bulk table operations, delete, modify and insert. Also capture table definition such that
 template sql statements can be used to insert single entries.

 this manager will ultimately become the underlying mechanism for simple "entity framework" like
 transactions i.e. working with a concrete java script type that requires efficient binding to
 the database, thus it must be robust and simple to enhance.
 */

'use strict'

var tableModule = (function () {
  function TableMgr (connection, connectionMeta, connectionUser) {
    var cache = {}
    var bulkTableManagers = {}
    var theConnection = connection
    var metaResolver = connectionMeta
    var user = connectionUser

    function describeTable (tableName, callback) {
      var cat

      function read (err, res) {
        if (err) {
          callback(err, res)
        }
        cat = res[0].cat
        var sql

        function mapFn (data) {
          var tableParts = tableName.split(/\.(?![^\[]*\])/g) // Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
          var table = tableParts[tableParts.length - 1] // get the table name
          var fullTableName = table
          var schema = tableParts[tableParts.length - 2] || '' // get the table schema, if missing set schema to ''
          if (tableParts.length > 2) {
            cat = tableParts[tableParts.length - 3]
          } else if (table[0] === '#') {
            cat = 'tempdb'
            fullTableName = cat + '.' + schema + '.' + table
          }
          sql = data.replace(/<table_name>/g, table.replace(/^\[|\]$/g, '').replace(/\]\]/g, ']')) // removes brackets at start end end, change ']]' to ']'
            .replace(/<table_schema>/g, schema.replace(/^\[|\]$/g, '').replace(/\]\]/g, ']')) // removes brackets at start end end, change ']]' to ']'
            .replace(/<escaped_table_name>/g, fullTableName) // use the escaped table name for the OBJECT_ID() function
            .replace(/<table_catalog>/g, cat) // use the escaped table name for the OBJECT_ID() function

          return sql
        }

        metaResolver.getTableDefinition(theConnection, mapFn, function (err, results) {
          callback(err, results)
        })
      }

      theConnection.query('select DB_NAME() as cat', read)
    }

    /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

    function Meta (tableName, cols) {
      function getFullName () {
        var first = cols[0]
        var tableCatalog = first.table_catalog
        var tableSchema = first.table_schema
        var tableName = first.table_name
        return tableCatalog + '.' + tableSchema + '.' + tableName
      }

      var fullTableName = cols.length > 0 && cols[0].table_catalog !== 'tempdb'
        ? getFullName()
        : tableName

      var allColumns = cols

      function recalculateAssignableColumns () {
        var subSet = []
        allColumns.forEach(function (col) {
          // noinspection JSUnresolvedVariable
          if (col.is_identity === false &&
            col.is_computed === false) {
            subSet.push(col)
          }
        })
        return subSet
      }

      function recalculatePrimaryColumns () {
        var primaryKeyCols = []
        allColumns.forEach(function (col) {
          // noinspection JSUnresolvedVariable
          if (col.is_primary_key) {
            primaryKeyCols.push(col)
          }
        })
        return primaryKeyCols
      }

      var insertSignature
      var whereColumns
      var updateColumns
      var selectSignature
      var deleteSignature
      var updateSignature
      var assignableColumns = recalculateAssignableColumns()

      var primaryCols = recalculatePrimaryColumns()
      var primaryByName = {}
      var cc

      for (cc = 0; cc < primaryCols.length; cc += 1) {
        primaryByName[primaryCols[cc].name] = primaryCols[cc]
      }

      var colByName = {}

      for (cc = 0; cc < allColumns.length; cc += 1) {
        colByName[allColumns[cc].name] = allColumns[cc]
      }

      function buildWhereForColumns (colSubSet) {
        var sql = 'where ( '
        var i
        var col
        for (i = 0; i < colSubSet.length; i += 1) {
          col = colSubSet[i]
          sql += col.name
          sql += ' = ? '
          if (i < colSubSet.length - 1) {
            sql += ' and '
          }
        }

        sql += ' )'
        return sql
      }

      function columnsSql (colSubSet) {
        var sql = ''
        var i
        var col
        for (i = 0; i < colSubSet.length; i += 1) {
          col = colSubSet[i]
          sql += '[' + col.name + ']'
          if (i < colSubSet.length - 1) {
            sql += ', '
          }
        }
        return sql
      }

      function buildSelectForColumns (colSubSet) {
        var colList = columnsSql(allColumns)
        var sql = 'select '
        sql += colList
        sql += ' from '
        sql += fullTableName + ' '
        sql += buildWhereForColumns(colSubSet)
        return sql
      }

      function buildDeleteForColumns (colSubSet) {
        var sql = 'delete from ' + fullTableName + ' '
        sql += buildWhereForColumns(colSubSet)
        return sql
      }

      function buildUpdateForColumns (subSet) {
        var sql = 'update ' + fullTableName
        sql += ' set '
        var i
        for (i = 0; i < subSet.length; i += 1) {
          sql += '[' + subSet[i].name + ']'
          sql += ' = ?'
          if (i < subSet.length - 1) {
            sql += ', '
          }
        }
        var where = buildWhereForColumns(whereColumns)
        sql += ' '
        sql += where
        return sql
      }

      function buildInsertForColumns () {
        var sql = 'insert into '
        sql += fullTableName
        var subSet = recalculateAssignableColumns()
        sql += ' ( '
        sql += columnsSql(subSet)
        sql += ') '
        if (subSet.length > 0) {
          sql += 'values ( '
          var i
          for (i = 0; i < subSet.length; i += 1) {
            sql += '?'
            if (i < subSet.length - 1) {
              sql += ', '
            }
          }
          sql += ' )'
        }

        return sql
      }

      function setWhereCols (colSubSet) {
        var subSet = []
        colSubSet.forEach(function (c) {
          if (colByName.hasOwnProperty(c.name)) {
            subSet.push(colByName[c.name])
          }
        })

        whereColumns = subSet
        insertSignature = buildInsertForColumns()
        deleteSignature = buildDeleteForColumns(subSet)
        selectSignature = buildSelectForColumns(subSet)
        updateSignature = buildUpdateForColumns(subSet)

        return selectSignature
      }

      function setUpdateCols (colSubSet) {
        var subSet = []
        colSubSet.forEach(function (c) {
          if (colByName.hasOwnProperty(c.name)) {
            subSet.push(colByName[c.name])
          }
        })
        updateColumns = subSet
        updateSignature = buildUpdateForColumns(updateColumns)

        return updateSignature
      }

      function recalculateUpdateColumns () {
        var assignable = recalculateAssignableColumns()
        var subSet = []
        assignable.forEach(function (col) {
          if (!primaryByName.hasOwnProperty(col.name)) {
            subSet.push(col)
          }
        })
        return subSet
      }

      setWhereCols(primaryCols)
      setUpdateCols(recalculateUpdateColumns())

      function getSummary () {
        return {
          insertSignature: insertSignature,
          whereColumns: whereColumns,
          updateColumns: updateColumns,
          selectSignature: selectSignature,
          deleteSignature: deleteSignature,
          updateSignature: updateSignature,
          columns: allColumns,
          primaryColumns: primaryCols,
          assignableColumns: assignableColumns,
          by_name: colByName
        }
      }

      function toString () {
        var s = getSummary()
        return JSON.stringify(s)
      }

      // export api

      function getAllColumns () {
        return allColumns
      }

      function getInsertSignature () {
        return insertSignature
      }

      function getWhereColumns () {
        return whereColumns
      }

      function getUpdateColumns () {
        return updateColumns
      }

      function getSelectSignature () {
        return selectSignature
      }

      function getDeleteSignature () {
        return deleteSignature
      }

      function getUpdateSignature () {
        return updateSignature
      }

      function getPrimaryColumns () {
        return primaryCols
      }

      function getAssignableColumns () {
        return assignableColumns
      }

      function getColumnsByName () {
        return colByName
      }

      return {
        getAllColumns: getAllColumns,
        toString: toString,
        getSummary: getSummary,
        setWhereCols: setWhereCols,
        setUpdateCols: setUpdateCols,

        getInsertSignature: getInsertSignature,
        getSelectSignature: getSelectSignature,
        getDeleteSignature: getDeleteSignature,
        getUpdateSignature: getUpdateSignature,
        getColumnsByName: getColumnsByName,
        getWhereColumns: getWhereColumns,
        getUpdateColumns: getUpdateColumns,
        getPrimaryColumns: getPrimaryColumns,
        getAssignableColumns: getAssignableColumns
      }
    }

    function describe (name, cb) {
      var tableMeta = cache[name]
      if (!tableMeta) {
        describeTable(name, function (err, cols) {
          if (!err) {
            tableMeta = new Meta(name, cols)
            cache[name] = tableMeta
            cb(tableMeta)
          } else {
            cb(err)
          }
        })
      } else {
        cb(tableMeta)
      }
    }

    function BulkTableOpMgr (m) {
      var meta = m
      var batch = 0
      var summary = meta.getSummary()

      function asTableType (name) {
        var summary = meta.getSummary()
        var columns = summary.columns

        if (!name) {
          name = columns[0].table_name + 'Type'
        }
        var cols = userTypeCols(name)
        return new user.Table(name, cols)
      }

      function userTypeCols () {
        var summary = meta.getSummary()
        var columns = summary.columns
        var cols = []
        columns.forEach(function (col) {
          var declaration = col.name + ' ' + col.type
          var length = 0
          if (col.max_length > 0) {
            if (col.type === 'nvarchar') {
              length = col.max_length / 2
            } else if (col.type === 'varbinary') {
              length = col.max_length
            }
          }

          if (length > 0) {
            declaration += '(' + length + ')'
          }
          cols.push({
            name: col.name,
            userType: declaration,
            type: {
              declaration: col.type,
              length: length
            }
          })
        })
        return cols
      }

      function asUserType (name) {
        var summary = meta.getSummary()
        var columns = summary.columns
        var cols = userTypeCols()
        var declarations = []
        cols.forEach(function (c) {
          declarations.push(c.userType)
        })
        // CREATE TYPE TestType AS TABLE ( a VARCHAR(50), b INT );

        if (!name) {
          name = columns[0].table_name + 'Type'
        }
        var sql = 'CREATE TYPE ' + name + ' AS TABLE ('
        sql = sql + declarations.join(', ')
        sql += ')'
        return sql
      }

      // create an object of arrays where each array represents all values
      // for the batch.

      function prepare (vec, o, arrays) {
        var keys = []
        if (vec.length === 0) {
          return keys
        }
        summary.columns.forEach(function (col) {
          var property = col.name
          // noinspection JSUnresolvedVariable
          if (summary.by_name.hasOwnProperty(property) &&
            summary.by_name[property].is_computed === false) {
            keys.push(property)
            var arr = o[property]
            if (!arr) {
              arr = []
              o[property] = arr
              arrays.push(arr)
            }
          }
        })
        return keys
      }

      function arrayPerColumn (vec) {
        var arrayColumnByName = {}
        var arrayOfArrays = []
        var keys = prepare(vec, arrayColumnByName, arrayOfArrays)

        vec.forEach(function (instance) {
          keys.forEach(function (property) {
            var columnValues = arrayColumnByName[property]
            var val = instance.hasOwnProperty(property)
              ? instance[property]
              : null
            columnValues.push(val)
          })
        })

        return {
          arrays_by_name: arrayColumnByName,
          array_of_arrays: arrayOfArrays
        }
      }

      // if batch size is set, split the input into that batch size.

      function rowBatches (rows) {
        var batches = []
        if (batch === 0) {
          batches.push(rows)
        } else {
          var singleBatch = []
          var i
          for (i = 0; i < rows.length; i += 1) {
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

      function arrayPerColumnForCols (rows, colSubSet) {
        var colsByName = arrayPerColumn(rows).arrays_by_name
        var colArray = []

        colSubSet.forEach(function (col) {
          if (colsByName.hasOwnProperty(col.name)) {
            colArray.push(colsByName[col.name])
          }
        })
        return colArray
      }

      // given the input array of asObjects consisting of potentially all columns, strip out
      // the sub set corresponding to the where column set.

      function whereForRowsNoBatch (sql, rows, callback) {
        var colArray = arrayPerColumnForCols(rows, summary.whereColumns)
        theConnection.query(sql, colArray, callback)
      }

      function selectRows (rows, callback) {
        var res = []
        whereForRowsNoBatch(summary.selectSignature, rows, function (err, results, more) {
          results.forEach(function (r) {
            res.push(r)
          })
          if (!more) {
            callback(err, res)
          }
        })
      }

      // for a bulk select, do not use batching.

      // delete using a batch at a time.

      function batchIterator (rows, iterate, callback) {
        var batches = rowBatches(rows)
        var batchIndex = 0

        function done (err, results, more) {
          batchIndex += 1
          if (!err && batchIndex < batches.length) {
            if (!more) {
              iterate(batches[batchIndex], done)
            }
          } else {
            callback(err, results, more)
          }
        }

        iterate(batches[batchIndex], done)
      }

      function whereForRows (sql, rows, callback) {
        function next (batch, done) {
          var colArray = arrayPerColumnForCols(batch, summary.whereColumns)
          theConnection.query(sql, colArray, done)
        }

        batchIterator(rows, next, callback)
      }

      function updateForRows (sql, rows, callback) {
        function next (batch, done) {
          var updateArray = arrayPerColumnForCols(batch, summary.updateColumns)
          var whereArray = arrayPerColumnForCols(batch, summary.whereColumns)
          var colArray = updateArray.concat(whereArray)
          theConnection.query(sql, colArray, done)
        }

        batchIterator(rows, next, callback)
      }

      function insertRows (rows, callback) {
        function next (batch, done) {
          var sql = summary.insertSignature
          var colArray = arrayPerColumnForCols(batch, summary.assignableColumns)
          theConnection.query(sql, colArray, done)
        }

        batchIterator(rows, next, callback)
      }

      function updateRows (rows, callback) {
        updateForRows(summary.updateSignature, rows, callback)
      }

      function deleteRows (rows, callback) {
        whereForRows(summary.deleteSignature, rows, callback)
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

      // public api

      return {
        asTableType: asTableType,
        asUserType: asUserType,
        insertRows: insertRows,
        selectRows: selectRows,
        deleteRows: deleteRows,
        updateRows: updateRows,
        setBatchSize: setBatchSize,
        setWhereCols: setWhereCols,
        setUpdateCols: setUpdateCols,
        getMeta: getMeta,
        meta: meta,
        columns: meta.getAllColumns(),
        getSummary: getSummary
      }
    }

    function bind (table, cb) {
      describe(table, function (meta) {
        var bulkMgr = new BulkTableOpMgr(meta)
        bulkTableManagers[table] = bulkMgr
        cb(bulkMgr)
      })
    }

    return {
      describe: describe,
      bind: bind
    }
  }

  return {
    TableMgr: TableMgr
  }
}())

exports.tableModule = tableModule
