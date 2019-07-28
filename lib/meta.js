'use strict'

const metaModule = (() => {
  const fs = require('fs')
  const path = require('path')

  function FileReader (file) {
    let resolvedSql

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

    function resolve () {
      return new Promise((resolve, reject) => {
        if (!resolvedSql) {
          const p = path.join(__dirname, 'queries', file)
          readFile(p).then(sql => {
            resolvedSql = sql
            resolve(resolvedSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(resolvedSql)
        }
      })
    }

    function query (conn, mapFn) {
      const sql = mapFn ? mapFn(resolvedSql) : resolvedSql
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

    return {
      resolve: resolve,
      query: query
    }
  }

  function Meta () {
    let describeProc = new FileReader('proc_describe.sql')
    let describeServerVersion = new FileReader('server_version.sql')
    let describeTableType = new FileReader('user_type.sql')
    let describeTable
    let serverVersionRes

    function getUserType (conn, userTypeName, mapFn, callback) {
      describeTableType.resolve().then(() => {
        describeTableType.query(conn, mapFn).then(typeResults => {
          typeResults.forEach(col => {
            col.type = {
              declaration: col.declaration,
              length: col.length
            }
          })
          callback(null, typeResults)
        }).catch(err => {
          callback(err, null)
        })
      }).catch(err => {
        callback(err, null)
      })
    }

    function getProcedureDefinition (conn, procedureName, mapFn, callback) {
      describeProc.resolve().then(() => {
        describeProc.query(conn, mapFn).then(typeResults => {
          callback(null, typeResults)
        }).catch(err => {
          callback(err, null)
        })
      }).catch(err => {
        callback(err, null)
      })
    }

    function getServerVersionRes (conn) {
      return new Promise((resolve, reject) => {
        if (!serverVersionRes) {
          describeServerVersion.resolve().then(() => {
            describeServerVersion.query(conn).then(serverRes => {
              serverVersionRes = serverRes
              resolve(serverVersionRes)
            }).catch(err => {
              reject(err, null)
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
        if (!describeTable) {
          var schema2014OrOlder = serverRes[0].MajorVersion <= 2014.0
          const fileName = schema2014OrOlder ? 'table_describe.2014.sql' : 'table_describe.sql'
          describeTable = new FileReader(fileName)
        }
        describeTable.resolve().then(() => {
          describeTable.query(conn, mapFn).then(typeResults => {
            callback(null, typeResults)
          }).catch(err => {
            callback(err, null)
          })
        }).catch(err => {
          callback(err, null)
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
