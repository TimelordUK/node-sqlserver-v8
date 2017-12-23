'use strict'

var metaModule = (function () {
  var fs = require('fs')
  var path = require('path')

  function Meta () {
    var describeProcedureSql
    var describeTableTypeSql
    var describeTableSql

    function readFile (f, done) {
      fs.readFile(f, 'utf8', function (err, contents) {
        if (err) {
          done(err)
        } else {
          done(contents)
        }
      })
    }

    function resolveDescribeProcedureSql (cb) {
      if (!describeProcedureSql) {
        var p = path.join(__dirname, 'queries', 'proc_describe.sql')
        readFile(p, function (sql) {
          describeProcedureSql = sql
          cb(describeProcedureSql)
        })
      } else {
        cb(describeProcedureSql)
      }
    }

    function resolveTableTypeSql (done) {
      if (!describeTableTypeSql) {
        var p = path.join(__dirname, 'queries', 'user_type.sql')
        readFile(p, function (data) {
          describeTableTypeSql = data
          done(describeTableTypeSql)
        })
      } else {
        done(describeTableTypeSql)
      }
    }

    function resolveTableSql (done) {
      if (!describeTableSql) {
        var p = path.join(__dirname, 'queries', 'table_describe.sql')
        readFile(p, function (data) {
          describeTableSql = data
          done(describeTableSql)
        })
      } else {
        done(describeTableSql)
      }
    }

    function getUserType (conn, userTypeName, mapFn, callback) {
      resolveTableTypeSql(function (sql) {
        sql = mapFn(sql)
        conn.query(sql, function (err, typeResults) {
          typeResults.forEach(function (col) {
            col.type = {
              declaration: col.declaration,
              length: col.length
            }
          })
          callback(err, typeResults)
        })
      })
    }

    function getProcedureDefinition (conn, procedureName, mapFn, callback) {
      resolveDescribeProcedureSql(function (sql) {
        sql = mapFn(sql)
        conn.query(sql, function (err, typeResults) {
          callback(err, typeResults)
        })
      })
    }

    function getTableDefinition (conn, mapFn, callback) {
      resolveTableSql(function (sql) {
        sql = mapFn(sql)
        conn.query(sql, function (err, typeResults) {
          callback(err, typeResults)
        })
      })
    }

    return {
      getUserType: getUserType,
      getProcedureDefinition: getProcedureDefinition,
      getTableDefinition: getTableDefinition
    }
  }

  return {
    Meta: Meta
  }
}())

/*
    provide support to fetch table and procedure meta data, injected into procedure manager and tableManager
  */

exports.metaModule = metaModule
