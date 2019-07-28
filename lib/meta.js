'use strict'

const metaModule = (() => {
  const fs = require('fs')
  const path = require('path')

  function Meta () {
    let describeProcedureSql
    let describeTableTypeSql
    let describeTableSql
    let serverVersionSql
    let serverVersionRes

    function readFile (f) {
      return new Promise((resolve, reject) => {
        fs.readFile(f, 'utf8', (err, contents) => {
          if (err) {
            reject(err)
          } else {
            resolve(contents)
          }
        })
      })
    }

    function query (conn, sql) {
      return new Promise((resolve, reject) => {
        conn.query(sql, (err, results) => {
          if (err) {
            reject(err)
          } else {
            resolve(results)
          }
        })
      })
    }

    function resolveDescribeProcedureSql () {
      return new Promise((resolve, reject) => {
        if (!describeProcedureSql) {
          const p = path.join(__dirname, 'queries', 'proc_describe.sql')
          readFile(p).then(sql => {
            describeProcedureSql = sql
            resolve(describeProcedureSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(describeProcedureSql)
        }
      })
    }

    function resolveTableTypeSql () {
      return new Promise((resolve, reject) => {
        if (!describeTableTypeSql) {
          const p = path.join(__dirname, 'queries', 'user_type.sql')
          readFile(p).then(sql => {
            describeTableTypeSql = sql
            resolve(describeTableTypeSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(describeTableTypeSql)
        }
      })
    }

    function resolveTableSqlUsing (file) {
      return new Promise((resolve, reject) => {
        if (!describeTableSql) {
          const p = path.join(__dirname, 'queries', file)
          readFile(p).then(sql => {
            describeTableSql = sql
            resolve(describeTableSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(describeTableSql)
        }
      })
    }

    function resolveServerVersionSql () {
      return new Promise((resolve, reject) => {
        if (!serverVersionSql) {
          const p = path.join(__dirname, 'queries', 'server_version.sql')
          readFile(p).then(sql => {
            serverVersionSql = sql
            resolve(serverVersionSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(serverVersionSql)
        }
      })
    }

    function getUserType (conn, userTypeName, mapFn, callback) {
      resolveTableTypeSql().then(sql => {
        sql = mapFn(sql)
        query(conn, sql).then(typeResults => {
          typeResults.forEach(col => {
            col.type = {
              declaration: col.declaration,
              length: col.length
            }
          })
          callback(null, typeResults)
        })
      }).catch(err => {
        callback(err, null)
      })
    }

    function getProcedureDefinition (conn, procedureName, mapFn, callback) {
      resolveDescribeProcedureSql().then(sql => {
        sql = mapFn(sql)
        query(conn, sql).then(typeResults => {
          callback(null, typeResults)
        }).catch(err => {
          callback(err, null)
        })
      })
    }

    function getServerVersionRes (conn) {
      return new Promise((resolve, reject) => {
        if (!serverVersionRes) {
          resolveServerVersionSql().then(sql => {
            query(conn, sql).then(serverRes => {
              serverVersionRes = serverRes
              resolve(serverVersionRes)
            })
          }).catch(err => {
            reject(err)
          })
        } else {
          resolve(serverVersionRes)
        }
      })
    }

    function getTableDefinition (conn, mapFn, callback) {
      getServerVersionRes(conn).then(serverRes => {
        var schema2014OrOlder = serverRes[0].MajorVersion <= 2014.0
        const fileName = schema2014OrOlder ? 'table_describe.2014.sql' : 'table_describe.sql'
        resolveTableSqlUsing(fileName).then(sql => {
          sql = mapFn(sql)
          query(conn, sql).then(typeResults => {
            callback(null, typeResults)
          })
        })
      }).catch(err => {
        callback(err, null)
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
