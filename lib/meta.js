'use strict'

var metaModule = (function () {

  var fs = require('fs')
  var path = require('path')

  function Meta() {

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
        var p = path.join(__dirname, 'queries', '/proc_describe.sql')
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
        var p = path.join(__dirname, 'queries', '/user_type.sql')
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
        var p = path.join(__dirname, 'queries', '/table_describe.sql')
        readFile(p, function (data) {
          describeTableSql = data
          done(describeTableSql)
        })
      } else {
        done(describeTableSql)
      }
    }

    function getUserType(conn, userTypeName, callback) {
      resolveTableTypeSql(function(sql) {
        sql = sql.replace(/<user_type_name>/g, userTypeName)
        conn.query(sql, function (err, typeResults) {
          callback(err, typeResults)
        })
      })
    }

    function getProcedure(conn, procedureName, callback) {
      resolveDescribeProcedureSql(function (sql) {
        sql = sql.replace(/<escaped_procedure_name>/g, procedureName)
        conn.query(sql, function (err, typeResults) {
          callback(err, typeResults)
        })
      })
    }

    function getTable(conn, mapFn, callback) {
      resolveTableSql(function (sql) {
        sql = mapFn(sql)
        conn.query(sql, function (err, typeResults) {
          callback(err, typeResults)
        })
      })
    }

    return {
      getUserType :getUserType,
      getProcedure:getProcedure,
      getTable:getTable
    }
  }

  return {
    Meta:Meta
  }

}())

/*
    provide support to fetch table and procedure meta data, injected into procedure manager and tableManager
  */

exports.metaModule = metaModule