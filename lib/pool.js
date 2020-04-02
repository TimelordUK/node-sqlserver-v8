'use strict'

const poolModule = (() => {
  const util = require('util')
  const connectionModule = require('./connection').connectionModule
  const events = require('events')

  function PoolEventCaster () {
    let queryObj = null
    let paused = false
    let pendingCancel = false

    function isPaused () {
      return paused
    }

    function getQueryObj () {
      return queryObj
    }

    function getQueryId () {
      return queryObj != null ? queryObj : -1
    }

    function getOperation () {
      return queryObj != null ? getOperation() : null
    }

    function isPendingCancel () {
      return pendingCancel
    }

    function cancelQuery (cb) {
      if (queryObj) {
        queryObj.cancelQuery(cb)
      } else {
        pendingCancel = true
        setImmediate(() => {
          if (cb) cb()
        })
      }
    }

    function pauseQuery () {
      paused = true
      if (queryObj) {
        queryObj.pause()
      }
    }

    function resumeQuery () {
      paused = false
      if (queryObj) {
        queryObj.resume()
      }
    }

    function setQueryObj (q) {
      queryObj = q
      q.on('submitted', (d) => {
        this.emit('submitted', d)
      })

      q.on('free', () => {
        this.emit('free')
      })

      q.on('error', (e, more) => {
        this.emit('error', e, more)
      })

      q.on('done', (r) => {
        this.emit('done', r)
      })

      q.on('row', (r) => {
        this.emit('row', r)
      })

      q.on('column', (i, v) => {
        this.emit('column', i, v)
      })

      q.on('info', (e) => {
        this.emit('info', e)
      })
    }

    this.isPendingCancel = isPendingCancel
    this.getOperation = getOperation
    this.getQueryObj = getQueryObj
    this.getQueryId = getQueryId
    this.setQueryObj = setQueryObj
    this.cancelQuery = cancelQuery
    this.pauseQuery = pauseQuery
    this.resumeQuery = resumeQuery
    this.isPaused = isPaused
  }

  function Pool (opt) {
    const openPromise = util.promisify(connectionModule.open)
    const idle = []
    const parked = []
    const workQueue = []
    const pause = []
    let busyConnectionCount = 0
    let opened = false
    let hbTimer = null
    let pollTimer = null
    const _this = this
    let descriptionId = 0
    let commandId = 0
    let pendingCreates = 0
    let killed = false

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
      _this.emit('debug', `[${description.id}] query work id = ${work.id}, workQueue = ${workQueue.length}`)
      const query = work.raw ? description.connection.queryRaw : description.connection.query
      const q = query(work.sql, work.paramsOrCallback, work.callback)
      work.poolNotifier.setQueryObj(q)
      q.on('submitted', () => {
        _this.emit('debug', `[${description.id}] submitted work id ${work.id}`)
        _this.emit('submitted', q)
        setImmediate(() => {
          crank()
        })
      })

      q.on('free', () => {
        description.totalElapsedQueryMs += new Date() - begin
        checkin(description)
        _this.emit('debug', `[${description.id}] free work id ${work.id}`)
        setImmediate(() => {
          crank()
        })
      })

      q.on('error', (e, more) => {
        _this.emit('error', e, more)
        setImmediate(() => {
          crank()
        })
      })
    }

    function promotePause () {
      const add = []
      const start = pause.length
      while (pause.length > 0) {
        const item = pause.pop()
        if (item.isPaused) {
          add.unshift(item)
        } else {
          workQueue.push(item)
        }
      }
      while (add.length > 0) {
        pause.unshift(add.pop())
      }
      if (start !== pause.length) {
        setImmediate(() => crank())
      }
    }

    function poll () {
      if (pause.length + workQueue.length > 0) {
        crank()
      }
    }

    function crank () {
      grow().then(() => {
        promotePause()
        while (workQueue.length > 0 && idle.length > 0) {
          const work = workQueue.pop()
          if (work.poolNotifier.isPendingCancel()) {
            _this.emit('debug', `query work id = ${work.id} has been cancelled waiting in pool to execute, workQueue = ${workQueue.length}`)
          } else if (work.poolNotifier.isPaused()) {
            pause.unshift(work)
          } else {
            const description = checkout()
            item(description, work)
          }
        }
      })
    }

    function newWorkItem (sql, paramsOrCallback, callback, notifier, raw) {
      return {
        id: commandId++,
        sql: sql,
        paramsOrCallback: paramsOrCallback,
        callback: callback,
        poolNotifier: notifier,
        raw: raw
      }
    }

    function query (sql, paramsOrCallback, callback) {
      const notifier = new PoolEventCaster()
      enqueue(newWorkItem(sql, paramsOrCallback, callback, notifier, false))
      return notifier
    }

    function queryRaw (sql, paramsOrCallback, callback) {
      const notifier = new PoolEventCaster()
      enqueue(newWorkItem(sql, paramsOrCallback, callback, notifier, true))
      return notifier
    }

    function enqueue (item) {
      if (killed) {
        return null
      }
      workQueue.unshift(item)
      setImmediate(() => {
        crank()
      })
    }

    function getStatus () {
      return {
        parked: parked.length,
        idle: idle.length,
        busy: busyConnectionCount,
        pause: pause.length,
        workQueue: workQueue.length
      }
    }

    function checkin (description) {
      if (killed) return
      idle.unshift(description)
      if (busyConnectionCount > 0) busyConnectionCount--
      _this.emit('status', getStatus())
      _this.emit('debug', `[${description.id}] checkin idle = ${idle.length}, parked = ${parked.length}, busy = ${busyConnectionCount}, pause = ${pause.length}, workQueue = ${workQueue.length}`)
    }

    function checkout () {
      if (idle.length === 0) return null
      const description = idle.pop()
      busyConnectionCount++
      _this.emit('status', getStatus())
      _this.emit('debug', `[${description.id}] checkout idle = ${idle.length}, parked = ${parked.length}, busy = ${busyConnectionCount}, pause = ${pause.length}, workQueue = ${workQueue.length}`)
      return description
    }

    function grow () {
      if (killed) return
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
          checkin(getDescription(c))
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
        pollTimer = setInterval(() => {
          poll()
        }, 200, _this)
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
      const description = checkout()
      const q = description.connection.query(options.heartbeatSql)
      q.on('column', (i, v) => {
        description.heatbeatSqlResponse = v
      })
      q.on('done', () => {
        description.keepAliveCount++ // reset by user query
        description.lastActive = new Date()
        checkin(description)
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
          checkin(description)
        }).catch(e => {
          _this.emit('error', e)
        })
      })
    }

    function close () {
      if (hbTimer) {
        clearInterval(hbTimer)
      }
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      killed = true
      // any parked connection will have been closed
      while (parked.length > 0) {
        parked.pop()
      }
      while (idle.length > 0) {
        const description = idle.pop()
        const promisedClose = util.promisify(description.connection.close)
        promisedClose().then(() => {
          _this.emit('debug', `[${description.id}] closed connection due to pool shutdown, idle = ${idle.length}, busy = ${busyConnectionCount}`)
        }).catch(e => {
          _this.emit('error', e)
        })
      }
      while (workQueue.length > 0) {
        workQueue.pop()
      }
    }

    this.open = open
    this.close = close
    this.query = query
    this.queryRaw = queryRaw
  }

  util.inherits(Pool, events.EventEmitter)
  util.inherits(PoolEventCaster, events.EventEmitter)

  return {
    Pool: Pool
  }
})()

exports.poolModule = poolModule
