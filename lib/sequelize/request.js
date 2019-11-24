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
    const columnMetadata = metadata[index]
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
    let rowBuffer = null
    let e = null
    let rowCount = 0
    
    debug(`connection (${context.uuid}): executing request (${this.uuid})`)
    context.requests.push(this)
    try {
      const request = context.connection.queryRaw(this.sql, (err, results) => {
        if (err) {
          context.removeRequest(this, err)
        }
      })

      request.on('meta', meta => {
        metadata = meta
      })
      request.on('rowcount', theRowCount => {
        rowCount = theRowCount
      })
      request.on('row', arg => {
        if (rowBuffer) {
          this.emit('row', rowBuffer)
        }
        rowBuffer = []
      })
      request.on('column', (index, data) => {
        let columnMetadata = metadata[index]
        let existing = rowBuffer[index]

        if (existing && existing.metadata.colName === columnMetadata.name) {
          if (typeof existing.value === 'string') {
            existing.value += data
            return
          } else if (existing.value instanceof Buffer) {
            existing.value = Buffer.concat([existing.value, data])
            return
          }
        }

        rowBuffer[index] = Request.createColumn(metadata, index, data)
      })

      request.on('error', err => {
        e = err
        context.removeRequest(this, e)
      })

      request.on('done', () => {
        if (rowBuffer) {
          this.emit('row', rowBuffer)
        }
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
