'use strict'

const metaModule = (() => {
  const fs = require('fs')
  const path = require('path')

  class FileReader {
    constructor (file) {
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
        const inst = this
        return new Promise((resolve, reject) => {
          inst.resolve().then(sql => {
            sql = mapFn ? mapFn(sql) : sql
            conn.query(sql, (err, results) => {
              if (err) {
                reject(err)
              } else {
                resolve(results)
              }
            })
          }).catch(e => {
            reject(e)
          })
        })
      }
      this.query = query
      this.resolve = resolve
    }
  }

  class Meta {
    constructor () {
      this.describeProc = new FileReader('proc_describe.sql')
      this.describeServerVersion = new FileReader('server_version.sql')
      this.describeTableType = new FileReader('user_type.sql')
      this.describeTable = new FileReader('table_describe.sql')
      this.describeTable2014 = new FileReader('table_describe.2014.sql')
    }

    getUserType (conn, userTypeName, mapFn) {
      return new Promise((resolve, reject) => {
        this.describeTableType.query(conn, mapFn).then(typeResults => {
          typeResults.forEach(col => {
            col.type = {
              declaration: col.declaration,
              length: col.length
            }
          })
          resolve(typeResults)
        }).catch(err => {
          reject(err)
        })
      })
    }

    getProcedureDefinition (conn, procedureName, mapFn) {
      return this.describeProc.query(conn, mapFn)
    }

    getServerVersionRes (conn) {
      return this.describeServerVersion.query(conn)
    }

    getTableDefinition (conn, majorVersion, mapFn) {
      const target = majorVersion <= 2014 ? this.describeTable2014 : this.describeTable
      return target.query(conn, mapFn)
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
