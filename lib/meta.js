'use strict'

const metaModule = (() => {
  const fs = require('fs')
  const path = require('path')

  function Meta () {
    let describeProcedureSql
    let describeTableTypeSql
    let describeTableSql

    function readFile (f, done) {
      fs.readFile(f, 'utf8', (err, contents) => {
        if (err) {
          done(err)
        } else {
          done(contents)
        }
      })
    }

    function resolveDescribeProcedureSql (cb) {
      if (!describeProcedureSql) {
        const p = path.join(__dirname, 'queries', 'proc_describe.sql')
        readFile(p, sql => {
          describeProcedureSql = sql
          cb(describeProcedureSql)
        })
      } else {
        cb(describeProcedureSql)
      }
    }

    function resolveTableTypeSql (done) {
      if (!describeTableTypeSql) {
        const p = path.join(__dirname, 'queries', 'user_type.sql')
        readFile(p, data => {
          describeTableTypeSql = data
          done(describeTableTypeSql)
        })
      } else {
        done(describeTableTypeSql)
      }
    }

    function resolveTableSql (done) {
      if (!describeTableSql) {
        const p = path.join(__dirname, 'queries', 'table_describe.sql')
        readFile(p, data => {
          describeTableSql = data
          done(describeTableSql)
        })
      } else {
        done(describeTableSql)
      }
    }

    function getUserType (conn, userTypeName, mapFn, callback) {
      resolveTableTypeSql(sql => {
        sql = mapFn(sql)
        conn.query(sql, (err, typeResults) => {
          typeResults.forEach(col => {
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
      resolveDescribeProcedureSql(sql => {
        sql = mapFn(sql)
        conn.query(sql, (err, typeResults) => {
          callback(err, typeResults)
        })
      })
    }

    function getTableDefinition (conn, mapFn, callback) {
      resolveTableSql(sql => {
        sql = mapFn(sql)
        conn.query(sql, (err, typeResults) => {
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
})()

/*
    provide support to fetch table and procedure meta data, injected into procedure manager and tableManager
  */

exports.metaModule = metaModule
