'use strict'

const EventEmitter = require('events').EventEmitter
const uuid = require('uuid')
const debug = require('debug')('msnodesqlv8-sequelize')

class Request extends EventEmitter {
  constructor (sql, callback) {
    super()

    this.uuid = uuid.v4()
    this.sql = sql
    this.callback = callback

    debug(`creating request (${this.uuid}): ${this.sql.length > 80 ? this.sql.slice(0, 80) + '...' : this.sql}`)
  }

  static createColumn (metadata, index, data) {
    let columnMetadata = metadata[index]
    return {
      metadata: {
        colName: columnMetadata.name,
        type: {
          id: columnMetadata.sqlType
        },
        nullable: columnMetadata.nullable,
        size: columnMetadata.size
      },
      value: data
    }
  }

  execute (context) {
    let metadata = null
    let currentRow = null
    let e = null
    let rowCount = 0
    let lastColumn = 0

    debug(`connection (${context.uuid}): executing request (${this.uuid})`)
    context.requests.push(this)
    try {
      let request = context.connection.queryRaw(this.sql)

      request.on('meta', (meta) => {
        metadata = meta
        currentRow = [metadata.length]
        lastColumn = metadata.length - 1
      })

      request.on('column', (index, data) => {
        currentRow[index] = Request.createColumn(metadata, index, data)
        if (index === lastColumn) {
          ++rowCount
          this.emit('row', currentRow)
          currentRow = [metadata.length]
        }
      })

      request.on('error', err => {
        e = err
        context.removeRequest(this, e)
      })

      request.on('done', () => {
        context.removeRequest(this)
        if (typeof this.callback === 'function') {
          this.callback(e, rowCount)
        }
      })
    } catch (ex) {
      context.removeRequest(this, ex)
      context.close()
    }
  }
}

module.exports = Request
