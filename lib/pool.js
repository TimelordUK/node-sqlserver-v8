'use strict'

const poolModule = (() => {
  const util = require('util')
  const connectionModule = require('./connection').connectionModule
  const events = require('events')

  function PoolEventCaster () {
  }

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
    let pendingCreates = 0

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
      grow().then(() => {
        while (workQueue.length > 0 && idle.length > 0) {
          busyConnectionCount++
          const begin = new Date()
          const description = idle.pop()
          const work = workQueue.pop()

          description.lastActive = new Date()
          description.keepAliveCount = 0
          description.queriesSent++
          _this.emit('debug', `[${description.id}] query work id ${work.id} idle length ${idle.length} busy count ${busyConnectionCount}`)
          const q = description.connection.query(work.sql, work.paramsOrCallback, work.callback)
          q.on('submitted', (d) => {
            _this.emit('debug', `[${description.id}] submitted work id ${work.id}`)
            _this.emit('submitted', q)
            work.poolNotifier.emit('submitted', d)
            setImmediate(() => {
              _this.crank()
            })
          })

          q.on('free', () => {
            description.totalElapsedQueryMs += new Date() - begin
            idle.unshift(description)
            busyConnectionCount--
            work.poolNotifier.emit('free')
            _this.emit('debug', `[${description.id}] free work id ${work.id} idle length ${idle.length} busy count ${busyConnectionCount}`)
            setImmediate(() => {
              _this.crank()
            })
          })

          q.on('error', (e, more) => {
            _this.emit('error', e)
            work.poolNotifier.emit('error', e, more)
            setImmediate(() => {
              _this.crank()
            })
          })

          q.on('done', (r) => {
            work.poolNotifier.emit('done', r)
          })

          q.on('row', (r) => {
            work.poolNotifier.emit('row', r)
          })

          q.on('column', (i, v) => {
            work.poolNotifier.emit('column', i, v)
          })

          q.on('info', (e) => {
            work.poolNotifier.emit('info', e)
          })
        }
      })
    }

    function query (sql, paramsOrCallback, callback) {
      const notifier = new PoolEventCaster()
      workQueue.unshift({
        id: commandId++,
        sql: sql,
        paramsOrCallback: paramsOrCallback,
        callback: callback,
        poolNotifier: notifier
      })
      setImmediate(() => {
        _this.crank()
      })
      return notifier
    }

    function grow () {
      const toPromise = []
      const existing = idle.length + busyConnectionCount + pendingCreates
      for (let i = existing; i < options.ceiling; ++i) {
        ++pendingCreates
        toPromise.push(openPromise(options.connectionString))
      }
      return Promise.all(toPromise).then(res => {
        res.forEach(c => {
          idle.unshift(_this.getDescription(c))
          --pendingCreates
        })
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
        idle.splice(firstIndex, 1)
        description.keepAliveCount++ // reset by user query
        const q = description.connection.query(options.heartbeatSql)
        q.on('column', (i, v) => {
          description.heatbeatSqlResponse = v
        })
        q.on('done', () => {
          description.lastActive = new Date()
          idle.unshift(description)
          _this.emit('debug', `[${description.id}] keep alive response = ${description.heatbeatSqlResponse} ${description.lastActive.toLocaleTimeString()} ${description.keepAliveCount} idle length ${idle.length} busy count ${busyConnectionCount}`)
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
  util.inherits(PoolEventCaster, events.EventEmitter)

  return {
    Pool: Pool
  }
})()

exports.poolModule = poolModule
