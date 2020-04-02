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
    const parked = []
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
      heartbeatSecs: getOpt(opt, 'heartbeat', 20),
      heartbeatSql: getOpt(opt, 'heartbeatSql', 'select @@SPID as spid'),
      inactivityTimeoutSecs: getOpt(opt, 'inactivityTimeoutSecs', 60),
      connectionString: getOpt(opt, 'connectionString', 'Driver={ODBC Driver 13 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;')
    }

    function newDescription (c) {
      return {
        id: descriptionId++,
        pool: this,
        connection: c,
        heartbeatSqlResponse: null,
        lastActive: new Date(),
        keepAliveCount: 0,
        recreateCount: 0,
        parkedCount: 0,
        queriesSent: 0,
        totalElapsedQueryMs: 0
      }
    }

    function parkedDescription (c) {
      if (parked.length > 0) {
        const d = parked.pop()
        d.connection = c
        d.heartbeatSqlResponse = null
        d.lastActive = new Date()
        d.keepAliveCount = 0
        return d
      } else {
        return null
      }
    }

    function getDescription (c) {
      return parkedDescription(c) || newDescription(c)
    }

    function item (description, work) {
      const begin = new Date()
      description.lastActive = begin
      description.keepAliveCount = 0
      description.queriesSent++
      _this.emit('debug', `[${description.id}] query work id ${work.id}`)
      const q = description.connection.query(work.sql, work.paramsOrCallback, work.callback)
      q.on('submitted', (d) => {
        _this.emit('debug', `[${description.id}] submitted work id ${work.id}`)
        _this.emit('submitted', q)
        work.poolNotifier.emit('submitted', d)
        setImmediate(() => {
          crank()
        })
      })

      q.on('free', () => {
        description.totalElapsedQueryMs += new Date() - begin
        toPool(description)
        work.poolNotifier.emit('free')
        _this.emit('debug', `[${description.id}] free work id ${work.id}`)
        setImmediate(() => {
          crank()
        })
      })

      q.on('error', (e, more) => {
        _this.emit('error', e)
        work.poolNotifier.emit('error', e, more)
        setImmediate(() => {
          crank()
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

    function crank () {
      grow().then(() => {
        while (workQueue.length > 0 && idle.length > 0) {
          const description = fromPool()
          const work = workQueue.pop()
          item(description, work)
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
        crank()
      })
      return notifier
    }

    function toPool (description) {
      idle.unshift(description)
      if (busyConnectionCount > 0) busyConnectionCount--
      _this.emit('debug', `[${description.id}] to pool idle = ${idle.length}, parked = ${parked.length}, busy = ${busyConnectionCount}, workQueue = ${workQueue.length}`)
    }

    function fromPool () {
      if (idle.length === 0) return null
      const description = idle.pop()
      busyConnectionCount++
      _this.emit('debug', `[${description.id}] from pool idle = ${idle.length}, parked = ${parked.length}, busy = ${busyConnectionCount}, workQueue = ${workQueue.length}`)
      return description
    }

    function grow () {
      const toPromise = []
      const existing = idle.length + busyConnectionCount + pendingCreates
      for (let i = existing; i < options.ceiling; ++i) {
        ++pendingCreates
        toPromise.push(openPromise(options.connectionString))
      }
      return Promise.all(toPromise).then(res => {
        if (res.length === 0) return
        _this.emit('debug', `grow creates ${res.length} connections for pool idle = ${idle.length}, busy = ${busyConnectionCount}, pending = ${pendingCreates}`)
        res.forEach(c => {
          toPool(getDescription(c))
          --pendingCreates
        })
      })
    }

    function open (cb) {
      if (opened) {
        return
      }
      grow().then(() => {
        _this.emit('open')
        if (cb) cb()
        if (options.heartbeatSecs) {
          hbTimer = setInterval(() => {
            park()
            heartbeat()
          }, 1000, _this)
          crank()
        }
        opened = true
      }).catch(e => {
        _this.emit('error', e)
      })
    }

    function park () {
      const toParkIndex = idle.findIndex(description => {
        const inactivePeriod = description.keepAliveCount * options.heartbeatSecs
        return inactivePeriod >= options.inactivityTimeoutSecs
      })
      if (toParkIndex === -1) return
      const description = idle[toParkIndex]
      if (parkDescription(description)) {
        idle.splice(toParkIndex, 1)
      }
    }

    function promoteToFront (index) {
      if (index < 0 || index >= idle.length) return
      const description = idle[index]
      idle.splice(index, 1)
      idle.push(description)
    }

    function heartbeat () {
      const toHeartBeatIndex = idle.findIndex(d => new Date() - d.lastActive >= options.heartbeatSecs * 1000)
      if (toHeartBeatIndex === -1) return
      promoteToFront(toHeartBeatIndex)
      const description = fromPool()
      const q = description.connection.query(options.heartbeatSql)
      q.on('column', (i, v) => {
        description.heatbeatSqlResponse = v
      })
      q.on('done', () => {
        description.keepAliveCount++ // reset by user query
        description.lastActive = new Date()
        toPool(description)
        const inactivePeriod = description.keepAliveCount * options.heartbeatSecs
        _this.emit('debug', `[${description.id}] heartbeat response = '${description.heatbeatSqlResponse}', ${description.lastActive.toLocaleTimeString()}` +
          `, keepAliveCount = ${description.keepAliveCount} inactivePeriod = ${inactivePeriod}, inactivityTimeoutSecs = ${options.inactivityTimeoutSecs}`)
      })
      q.on('error', (e) => {
        _this.emit('error', e)
        recreate(description)
      })
    }

    function parkDescription (description) {
      // need to leave at least floor connections in idle pool
      const canPark = Math.max(0, idle.length - options.floor)
      if (canPark === 0) return false
      _this.emit('debug', `[${description.id}] close connection and park due to inactivity parked = ${parked.length}, canPark = ${canPark}`)

      const promisedClose = util.promisify(description.connection.close)
      promisedClose().then(() => {
        description.connection = null
        description.parkedCount++
        description.keepAliveCount = 0
        parked.unshift(description)
        _this.emit('debug', `[${description.id}] closed connection and park due to inactivity parked = ${parked.length}, idle = ${idle.length}, busy = ${busyConnectionCount}`)
      }).catch(e => {
        _this.emit('error', e)
      })
      return true
    }

    function recreate (description) {
      _this.emit('debug', `recreate connection [${description.id}]`)
      const toPromise = []
      if (description.connection) {
        const promisedClose = util.promisify(description.connection.close)
        toPromise.push(promisedClose)
      }
      Promise.all(toPromise).then(() => {
        openPromise(options.connectionString).then(conn => {
          description.connection = conn
          description.lastActive = new Date()
          description.heartbeatSqlResponse = null
          description.recreateCount++
          toPool(description)
        }).catch(e => {
          _this.emit('error', e)
        })
      })
    }

    function close () {
      if (hbTimer) {
        clearInterval(hbTimer)
      }
    }

    this.open = open
    this.close = close
    this.query = query
  }

  util.inherits(Pool, events.EventEmitter)
  util.inherits(PoolEventCaster, events.EventEmitter)

  return {
    Pool: Pool
  }
})()

exports.poolModule = poolModule
