'use strict'

const poolModule = (() => {
  const util = require('util')
  const connectionModule = require('./connection').connectionModule
  const events = require('events')

  function Pool (opt) {
    const openPromise = util.promisify(connectionModule.open)
    const idle = []
    let opened = false
    let hbTimer = null

    function getOpt (src, p, def) {
      if (!src) return def
      return src[p] || def
    }

    const options = {
      floor: getOpt(opt, 'floor', 0),
      ceiling: getOpt(opt, 'ceiling', 5),
      heartbeatSecs: getOpt(opt, 'heartbeat', 10),
      heartbeatSql: getOpt(opt, 'heartbeatSql', 'select @@SPID as spid'),
      inactivityTimoutSecs: getOpt(opt, 'inactivityTimoutSecs', 300),
      connectionString: getOpt(opt, 'connectionString', 'Driver={ODBC Driver 13 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;')
    }

    function getDescription (c) {
      return {
        connection: c,
        heartbeatSqlResponse: null,
        lastActive: new Date(),
        keepAliveCount: 0,
        recreateCount: 0,
        harvestedCount: 0,
        queriesSent: 0
      }
    }

    function grow () {
      const toPromise = []
      for (let i = idle.length; i < options.ceiling; ++i) {
        toPromise.push(openPromise(options.connectionString))
      }
      return Promise.all(toPromise).then(res => {
        res.forEach(c => idle.push(getDescription(c)))
      })
    }

    function open (cb) {
      if (opened) {
        return
      }
      grow().then(() => {
        this.emit('open')
        if (cb) cb()
        if (options.heartbeatSecs) {
          hbTimer = setInterval(() => {
            check()
          }, 1000, this)
        }
        opened = true
      }).catch(e => {
        this.emit('error', e)
      })
    }

    function check () {
      const firstIndex = idle.findIndex(d => new Date() - d.lastActive >= options.heartbeatSecs * 1000)
      if (firstIndex > -1) {
        const description = idle[firstIndex]
        idle.slice(firstIndex, 1)
        description.keepAliveCount++ // reset by user query
        const q = description.connection.query(options.heartbeatSql)
        q.on('column', (i, v) => {
          description.heatbeatSqlResponse = v
        })
        q.on('done', () => {
          description.lastActive = new Date()
          console.log(`connection good ${description.heatbeatSqlResponse} ${description.lastActive} ${description.keepAliveCount}`)
        })
        q.on('error', (e) => {
          this.emit('error', e)
          recreate(description)
        })
      }
    }

    function recreate (description) {
      if (description.connection) {
        description.connection.close(() => {
          openPromise(options.connectionString).then(conn => {
            description.connection = conn
            description.lastActive = new Date()
            description.heartbeatSqlResponse = null
            description.recreateCount++
            idle.push(description)
          }).catch(e => {
            this.emit('error', e)
          })
        })
      }
    }

    function close () {
      if (hbTimer) {
        clearInterval(hbTimer)
      }
    }

    this.open = open
    this.close = close
  }

  util.inherits(Pool, events.EventEmitter)
  return {
    Pool: Pool
  }
})()

exports.poolModule = poolModule
