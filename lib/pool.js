'use strict'

const poolModule = (() => {
  const util = require('util')
  const connectionModule = require('./connection').connectionModule
  const events = require('events')

  function Pool (opt) {
    const openPromise = util.promisify(connectionModule.open)
    const idle = []
    const workQueue = []
    let busyConnectionCount = 0
    let opened = false
    let hbTimer = null
    const _this = this
    let descriptionId = 0
    let commandId = 0

    function getOpt (src, p, def) {
      if (!src) return def
      return src[p] || def
    }

    const options = {
      floor: getOpt(opt, 'floor', 0),
      ceiling: getOpt(opt, 'ceiling', 4),
      heartbeatSecs: getOpt(opt, 'heartbeat', 30),
      heartbeatSql: getOpt(opt, 'heartbeatSql', 'select @@SPID as spid'),
      inactivityTimoutSecs: getOpt(opt, 'inactivityTimoutSecs', 120),
      connectionString: getOpt(opt, 'connectionString', 'Driver={ODBC Driver 13 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;')
    }

    function getDescription (c) {
      return {
        id: descriptionId++,
        pool: this,
        connection: c,
        heartbeatSqlResponse: null,
        lastActive: new Date(),
        keepAliveCount: 0,
        recreateCount: 0,
        harvestedCount: 0,
        queriesSent: 0,
        totalElapsedQueryMs: 0
      }
    }

    function crank () {
      while (workQueue.length > 0 && idle.length > 0) {
        busyConnectionCount++
        const begin = new Date()
        const description = idle.pop()
        const work = workQueue.pop()

        description.lastActive = new Date()
        description.keepAliveCount = 0
        description.queriesSent++
        _this.emit('debug', `[${description.id}] query work id ${work.id}`)
        const q = description.connection.query(work.sql, work.paramsOrCallback, work.callback)
        q.on('submitted', () => {
          _this.emit('debug', `[${description.id}] submitted work id ${work.id}`)
          _this.emit('submitted', q)
          setImmediate(() => {
            _this.crank()
          })
        })

        q.on('free', () => {
          _this.emit('debug', `[${description.id}] free work id ${work.id}`)
          description.totalElapsedQueryMs += new Date() - begin
          idle.unshift(description)
          busyConnectionCount--
          setImmediate(() => {
            _this.crank()
          })
        })

        q.on('error', (e) => {
          _this.emit('error', e)
          setImmediate(() => {
            _this.crank()
          })
        })
      }
    }

    function query (sql, paramsOrCallback, callback) {
      workQueue.unshift({
        id: commandId++,
        sql: sql,
        paramsOrCallback: paramsOrCallback,
        callback: callback
      })
      setImmediate(() => {
        _this.crank()
      })
    }

    function grow () {
      const toPromise = []
      for (let i = idle.length + busyConnectionCount; i < options.ceiling; ++i) {
        toPromise.push(openPromise(options.connectionString))
      }
      return Promise.all(toPromise).then(res => {
        res.forEach(c => idle.unshift(_this.getDescription(c)))
      })
    }

    function open (cb) {
      if (opened) {
        return
      }
      _this.grow().then(() => {
        _this.emit('open')
        if (cb) cb()
        if (options.heartbeatSecs) {
          hbTimer = setInterval(() => {
            _this.check()
          }, 1000, _this)
          _this.crank()
        }
        opened = true
      }).catch(e => {
        _this.emit('error', e)
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
          _this.emit('debug', `[${description.id}] keep alive response = ${description.heatbeatSqlResponse} ${description.lastActive} ${description.keepAliveCount}`)
        })
        q.on('error', (e) => {
          _this.emit('error', e)
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
            idle.unshift(description)
          }).catch(e => {
            _this.emit('error', e)
          })
        })
      }
    }

    function close () {
      if (hbTimer) {
        clearInterval(hbTimer)
      }
    }

    this.grow = grow
    this.crank = crank
    this.open = open
    this.close = close
    this.query = query
    this.check = check
    this.getDescription = getDescription
  }

  util.inherits(Pool, events.EventEmitter)
  return {
    Pool: Pool
  }
})()

exports.poolModule = poolModule
