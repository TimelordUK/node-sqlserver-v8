'use strict'

const metaModule = (() => {
  const fs = require('fs')
  const path = require('path')

  class FileReader {
    constructor (file) {
      this.resolvedSql = null
      this.file = file
    }

    readFile (f) {
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

    resolve () {
      return new Promise((resolve, reject) => {
        if (!this.resolvedSql) {
          const p = path.join(__dirname, 'queries', this.file)
          this.readFile(p).then(sql => {
            this.resolvedSql = sql
            resolve(this.resolvedSql)
          }).catch(e => {
            reject(e)
          })
        } else {
          resolve(this.resolvedSql)
        }
      })
    }

    query (conn, mapFn) {
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
    Meta
  }
})()

/*
    provide support to fetch table and procedure metadata, injected into procedure manager and tableManager
  */

exports.metaModule = metaModule
