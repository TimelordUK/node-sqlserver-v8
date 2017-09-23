'use strict'

var fs = require('fs')
var path = require('path')

/*
    provide support to fetch table and procedure meta data, injected into procedure manager and tableManager
  */

function Meta() {

  var describeProcedureSql
  var describeTableTypeSql

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

  return {
    getUserType :getUserType,
    getProcedure:getProcedure
  }
}

exports.Meta = Meta