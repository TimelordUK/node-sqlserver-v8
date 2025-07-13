'use strict'

const poolModule = (() => {
  const util = require('util')
  const { EventEmitter } = require('stream')
  const { procedureModule } = require('./procedure')
  const { driverModule } = require('./driver')
  const sqlClientModule = require('./sql-client').sqlCLientModule
  const { notifyModule } = require('./notifier')
  const { utilModule } = require('./util')
  const { tableModule } = require('./table')
  const userModule = require('./user').userModule
  const { metaModule } = require('./meta')
  const cppDriver = new utilModule.Native().cppDriver

  class PoolWorkItem {
    constructor (id, sql, paramsOrCallback, callback, poolNotifier, workType, chunky) {
      this.id = id
      this.sql = sql
      this.paramsOrCallback = paramsOrCallback
      this.callback = callback
      this.poolNotifier = poolNotifier
      this.workType = workType
      this.chunky = chunky
    }
  }

  class PoolDescription {
    constructor (id, pool, connection) {
      this.id = id
      this.pool = pool
      this.connection = connection
      this.heartbeatSqlResponse = null
      this.lastActive = new Date()
      this.work = null
      this.keepAliveCount = 0
      this.recreateCount = 0
      this.parkedCount = 0
      this.queriesSent = 0
      this.beganAt = null
      this.totalElapsedQueryMs = 0
    }

    begin () {
      const now = new Date()
      this.beganAt = now
      this.lastActive = now
      this.keepAliveCount = 0
      this.queriesSent++
    }

    free () {
      this.totalElapsedQueryMs += new Date() - this.beganAt
    }

    heartbeatResponse (v) {
      this.heartbeatSqlResponse = v
    }

    heartbeat () {
      this.keepAliveCount++ // reset by user query
      this.lastActive = new Date()
    }

    assignConnection (c) {
      this.connection = c
      this.work = null
      this.heartbeatSqlResponse = null
      this.lastActive = new Date()
      this.keepAliveCount = 0
    }

    recreate (conn) {
      this.connection = conn
      this.lastActive = new Date()
      this.heartbeatSqlResponse = null
      this.recreateCount++
    }

    park () {
      this.connection = null
      this.parkedCount++
      this.keepAliveCount = 0
      this.beganAt = null
    }
  }

  class PoolEventCaster extends EventEmitter {
    constructor () {
      super()
      this.queryObj = null
      this.paused = false
      this.pendingCancel = false
    }

    isPaused () {
      return this.paused
    }

    getQueryObj () {
      return this.queryObj
    }

    getQueryId () {
      return this.queryObj ?? -1
    }

    isPendingCancel () {
      return this.pendingCancel
    }

    cancelQuery (cb) {
      if (this.queryObj) {
        this.queryObj.cancelQuery(cb)
      } else {
        this.pendingCancel = true
        setImmediate(() => {
          if (cb) {
            cb()
          }
        })
      }
    }

    pauseQuery () {
      this.paused = true
      if (this.queryObj) {
        this.queryObj.pauseQuery()
      }
    }

    resumeQuery () {
      this.paused = false
      if (this.queryObj) {
        this.queryObj.resumeQuery()
      }
    }

    setQueryObj (q, chunky) {
      this.queryObj = q
      q.on('submitted', (d) => {
        this.emit('submitted', d)
      })

      if (!chunky.callback) {
        q.on('error', (e, more) => {
          if (this.listenerCount('error') > 0) {
            this.emit('error', e, more)
          }
        })
      }

      q.on('done', (r) => {
        this.emit('done', r)
      })

      q.on('row', (r) => {
        this.emit('row', r)
      })

      q.on('column', (i, v) => {
        this.emit('column', i, v)
      })

      q.on('meta', (m) => {
        this.emit('meta', m)
      })

      q.on('info', (e) => {
        this.emit('info', e)
      })

      q.on('output', (e) => {
        this.emit('output', e)
      })
    }

    isPrepared () {
      return false
    }
  }

  class PoolOptions {
    constructor (opt) {
      this.floor = Math.max(0, this.getOpt(opt, 'floor', 0))
      this.ceiling = Math.max(1, this.getOpt(opt, 'ceiling', 4))
      this.heartbeatSecs = Math.max(1, this.getOpt(opt, 'heartbeatSecs', 20))
      this.heartbeatSql = this.getOpt(opt, 'heartbeatSql', 'select @@SPID as spid')
      this.inactivityTimeoutSecs = Math.max(3, this.getOpt(opt, 'inactivityTimeoutSecs', 60))
      this.connectionString = this.getOpt(opt, 'connectionString', '')
      this.useUTC = this.getOpt(opt, 'useUTC', null)
      this.useNumericString = this.getOpt(opt, 'useNumericString', null)
      this.maxPreparedColumnSize = this.getOpt(opt, 'maxPreparedColumnSize', null)
      this.floor = Math.min(this.floor, this.ceiling)
      this.inactivityTimeoutSecs = Math.max(this.inactivityTimeoutSecs, this.heartbeatSecs)

      // Scaling strategy options
      this.scalingStrategy = this.getOpt(opt, 'scalingStrategy', 'aggressive') // 'aggressive', 'gradual', 'exponential'
      this.scalingIncrement = Math.max(1, this.getOpt(opt, 'scalingIncrement', 5)) // For gradual strategy
      this.scalingFactor = Math.max(1.1, Math.min(2.0, this.getOpt(opt, 'scalingFactor', 1.5))) // For exponential strategy
      this.scalingDelay = Math.max(0, this.getOpt(opt, 'scalingDelay', 100)) // ms delay between connection creations
    }

    getOpt (src, p, def) {
      if (!src) {
        return def
      }
      let ret
      if (Object.hasOwnProperty.call(src, p)) {
        ret = src[p]
      } else {
        ret = def
      }
      return ret
    }
  }

  class PoolPromises {
    constructor (pool) {
      this.pool = pool
      this.open = util.promisify(pool.open)
      this.close = util.promisify(pool.close)
      this.query = pool.queryAggregator
      this.callProc = pool.callprocAggregator
      this.getUserTypeTable = pool.getUserTypeTable
      this.getTable = pool.getTable
      this.getProc = pool.getProc
      this.beginTransaction = util.promisify(pool.beginTransaction)
      this.commitTransaction = util.promisify(pool.commitTransaction)
      this.rollbackTransaction = util.promisify(pool.rollbackTransaction)
    }

    transaction (cb) {
      let connectionDescription
      return this.beginTransaction()
        .then((description) => cb(connectionDescription = description))
        .then(
          () => this.commitTransaction(connectionDescription),
          err => {
            // If no connectionDescription, do nothing, the beginTransaction errored
            // and we can report it directly.
            if (!connectionDescription) { return Promise.reject(err) }

            // Error in cb() we should notify about it
            if (this.pool.listenerCount('error') > 0) {
              this.pool.emit('error', err)
            }

            return this.rollbackTransaction(connectionDescription)
              .catch((rollbackError) => {
                // We encountered error during rollback, emit an error on the pool for it
                if (this.pool.listenerCount('error') > 0) {
                  this.pool.emit('error', rollbackError)
                }
              })
              .then(
                async () => {
                  // Return the original error regardless if rollback was
                  // successful or not.
                  return Promise.reject(err)
                }
              )
          }
        )
    }
  }

  class Pool extends EventEmitter {
    constructor (opt) {
      super()
      const clientPromises = sqlClientModule.promises
      const idle = []
      const parked = []
      const workQueue = []
      const pause = []
      let busyConnectionCount = 0
      let parkingConnectionCount = 0
      let opened = false
      let hbTimer = null
      let pollTimer = null
      const _this = this
      let descriptionId = 0
      let commandId = 0
      let pendingCreates = 0
      let closed = false
      const heartbeatTickMs = 250
      const notifierFactory = new notifyModule.NotifyFactory()
      const poolProcedureCache = {}
      const poolTableCache = {}
      const aggregator = new utilModule.QueryAggregator(this)
      const userTypes = new userModule.SqlTypes()
      const sqlMeta = new metaModule.Meta()
      const native = new cppDriver.Connection()
      const driverMgr = new driverModule.DriverMgr(native)
      const tableMgr = new tableModule.TableMgr(this, sqlMeta, userTypes, poolTableCache)
      const procedureManager = new procedureModule.ProcedureMgr(this, notifierFactory, driverMgr, sqlMeta, poolProcedureCache)
      const closedError = new Error('pool is closed.')

      function parseOptions () {
        return new PoolOptions(opt)
      }

      const options = parseOptions()

      function getUseUTC () {
        return options.useUTC
      }

      function setUseUTC (utc) {
        options.useUTC = utc
      }

      function newDescription (c) {
        return new PoolDescription(descriptionId++, this, c)
      }

      function parkedDescription (c) {
        if (parked.length > 0) {
          const d = parked.pop()
          d.assignConnection(c)
          return d
        } else {
          return null
        }
      }

      function getDescription (c) {
        return parkedDescription(c) || newDescription(c)
      }

      function runTheQuery (q, description, work) {
        let errored = false

        work.poolNotifier.setQueryObj(q, work.chunky)
        q.on('submitted', () => {
          _this.emit('debug', `[${description.id}] submitted work id ${work.id}`)
          _this.emit('submitted', q)
          description.work = work
          setImmediate(() => {
            crank()
          })
        })

        q.on('free', () => {
          description.free()

          // Transactions can not be freed yet if no errors occured. They need to be freed later
          if (!errored && description.work && description.work.workType === workTypeEnum.TRANSACTION) {
            _this.emit('debug', `[${description.id}] inside transaction from work id ${work.id}`)
            return
          }

          checkin('work', description)
          _this.emit('debug', `[${description.id}] free work id ${work.id}`)
          work.poolNotifier.emit('free')
          setImmediate(() => {
            crank()
          })
        })

        q.on('error', (e, more) => {
          errored = true
          sendError(e, more)
          setImmediate(() => {
            crank()
          })
        })
      }

      function getTheQuery (description, work) {
        let q = null
        const connection = description.connection
        switch (work.workType) {
          case workTypeEnum.QUERY:
            q = connection.query(work.sql, work.paramsOrCallback, work.callback)
            break

          case workTypeEnum.RAW:
          case workTypeEnum.COMMITTING:
            q = connection.queryRaw(work.sql, work.paramsOrCallback, work.callback)
            break

          case workTypeEnum.PROC:
            q = connection.callproc(work.sql, work.paramsOrCallback, work.callback)
            break

          case workTypeEnum.TRANSACTION:
            q = connection.queryRaw(work.sql, work.paramsOrCallback, function (err) {
              work.callback(err, err ? null : description)
            })
            break
        }
        return q
      }

      function item (description, work) {
        description.begin()
        _this.emit('debug', `[${description.id}] query work id = ${work.id}, workQueue = ${workQueue.length}`)
        const q = getTheQuery(description, work)
        if (q) {
          runTheQuery(q, description, work)
        }
      }

      function doneFree (poolNotifier) {
        poolNotifier.emit('done')
        poolNotifier.emit('free')
      }

      /** Move unpaused items to queue */
      function promotePause () {
        const start = pause.length

        for (let i = 0; i < pause.length; i++) {
          if (!pause[i].isPaused) {
            workQueue.push(pause.splice(i, 1)[0])
            i--
          }
        }

        if (start !== pause.length) {
          setImmediate(() => { crank() })
        }
      }

      function poll () {
        if (pause.length + workQueue.length > 0) {
          crank()
        }
      }

      function crank () {
        if (closed) {
          return
        }
        void grow().then(() => {
          promotePause()
          while (workQueue.length > 0 && idle.length > 0) {
            const work = workQueue.pop()
            if (work.poolNotifier.isPendingCancel()) {
              _this.emit('debug', `query work id = ${work.id} has been cancelled waiting in pool to execute, workQueue = ${workQueue.length}`)
              doneFree(work.poolNotifier)
            } else if (work.poolNotifier.isPaused()) {
              pause.unshift(work)
            } else {
              const description = checkout('work')
              item(description, work)
            }
          }
        })
      }

      const workTypeEnum = {
        QUERY: 10,
        RAW: 11,
        PROC: 12,
        TRANSACTION: 13,
        COMMITTING: 14
      }

      function chunk (paramsOrCallback, callback, workType) {
        switch (workType) {
          case workTypeEnum.QUERY:
          case workTypeEnum.RAW:
          case workTypeEnum.COMMITTING:
            return notifierFactory.getChunkyArgs(paramsOrCallback, callback)

          case workTypeEnum.PROC:
          case workTypeEnum.TRANSACTION:
            return { params: paramsOrCallback, callback }
        }
      }

      function newWorkItem (sql, paramsOrCallback, callback, notifier, workType) {
        return new PoolWorkItem(commandId++, sql, paramsOrCallback, callback, notifier, workType, chunk(paramsOrCallback, callback, workType))
      }

      async function checkClosedPromise () {
        return new Promise((resolve, reject) => {
          if (closed) {
            reject(closedError)
          } else {
            resolve(null)
          }
        })
      }

      function submit (sql, paramsOrCallback, callback, type) {
        const notifier = new PoolEventCaster()
        const work = newWorkItem(sql, paramsOrCallback, callback, notifier, type)
        if (!closed) {
          enqueue(work)
        } else {
          if (work.chunky.callback) {
            setImmediate(() => {
              work.chunky.callback(closedError)
            })
          } else {
            sendError(closedError)
            setImmediate(() => {
              notifier.emit('error', closedError)
              doneFree(notifier)
            })
          }
        }
        return notifier
      }

      function query (sql, paramsOrCallback, callback) {
        return submit(sql, paramsOrCallback, callback, workTypeEnum.QUERY)
      }

      function queryRaw (sql, paramsOrCallback, callback) {
        return submit(sql, paramsOrCallback, callback, workTypeEnum.RAW)
      }

      function callproc (sql, paramsOrCallback, callback) {
        return submit(sql, paramsOrCallback, callback, workTypeEnum.PROC)
      }

      function beginTransaction (callback) {
        if (!callback || typeof callback !== 'function') {
          throw new Error('[msnodesql] Pool beginTransaction called with empty callback.')
        }
        return submit('BEGIN TRANSACTION', [], callback, workTypeEnum.TRANSACTION)
      }

      function finishTransaction (sql, description, callback) {
        if ((!description) instanceof PoolDescription) {
          throw new Error('[msnodesql] Pool end transaction called with non-description.')
        }
        const work = description.work
        if (!work) {
          throw new Error('[msnodesql] Pool end transaction called with unknown or finished transaction.')
        }

        if (work.workType !== workTypeEnum.TRANSACTION && work.workType !== workTypeEnum.COMMITTING) {
          throw new Error('[msnodesql] Pool end transaction called with unknown or finished transaction.')
        }

        _this.emit('debug', `[${description.id}] closing transaction from ${work.id} with ${sql}`)
        work.callback = callback
        work.sql = sql
        work.workType = workTypeEnum.COMMITTING
        item(description, work)
        return work.poolNotifier
      }

      function commitTransaction (description, callback) {
        return finishTransaction('IF (@@TRANCOUNT > 0) COMMIT TRANSACTION', description, callback)
      }

      function rollbackTransaction (description, callback) {
        return finishTransaction('IF (@@TRANCOUNT > 0) ROLLBACK TRANSACTION', description, callback)
      }

      async function getUserTypeTable (name) {
        // the table mgr will submit query into pool as if it's a connection
        return checkClosedPromise().then(async () => tableMgr.promises.getUserTypeTable(name))
      }

      async function getTable (name) {
        return checkClosedPromise().then(async () => tableMgr.promises.getTable(name))
      }

      async function getProc (name) {
        return checkClosedPromise().then(async () => procedureManager.promises.getProc(name))
      }

      // returns a promise of aggregated results not a query
      async function callprocAggregator (name, params, options) {
        return checkClosedPromise().then(async () => aggregator.callProc(name, params, options))
      }

      async function queryAggregator (sql, params, options) {
        return checkClosedPromise().then(async () => aggregator.query(sql, params, options))
      }

      function enqueue (item) {
        if (closed) {
          return
        }
        workQueue.unshift(item)
        if (opened) {
          setImmediate(() => {
            crank()
          })
        }
      }

      function getStatus (work, activity, op) {
        const s = {
          time: new Date(),
          parked: parked.length,
          idle: idle.length,
          busy: busyConnectionCount,
          pause: pause.length,
          parking: parkingConnectionCount,
          workQueue: workQueue.length,
          activity,
          op
        }
        if (work) {
          s.lastSql = work.sql
          s.lastParams = work.chunky.params
        }
        return s
      }

      function checkin (activity, description) {
        if (closed) {
          return
        }
        idle.unshift(description)
        if (busyConnectionCount > 0) {
          busyConnectionCount--
        }
        _this.emit('status', getStatus(description.work, activity, 'checkin'))
        description.work = null
        _this.emit('debug', `[${description.id}] checkin idle = ${idle.length}, parking = ${parkingConnectionCount}, parked = ${parked.length}, busy = ${busyConnectionCount}, pause = ${pause.length}, workQueue = ${workQueue.length}`)
      }

      function checkout (activity) {
        if (idle.length === 0) {
          return null
        }
        const description = idle.pop()
        busyConnectionCount++
        _this.emit('status', getStatus(null, activity, 'checkout'))
        _this.emit('debug', `[${description.id}] checkout idle = ${idle.length}, parking = ${parkingConnectionCount}, parked = ${parked.length}, busy = ${busyConnectionCount}, pause = ${pause.length}, workQueue = ${workQueue.length}`)
        return description
      }

      async function grow () {
        if (closed) {
          return
        }
        const existing = idle.length + busyConnectionCount + pendingCreates + parkingConnectionCount

        if (existing >= options.ceiling) {
          return
        }

        function connectionOptions (c) {
          c.setSharedCache(poolProcedureCache, poolTableCache)
          if (options.maxPreparedColumnSize) {
            c.setMaxPreparedColumnSize(options.maxPreparedColumnSize)
          }
          if (options.useUTC === true || options.useUTC === false) {
            c.setUseUTC(options.useUTC)
          }
          if (options.useNumericString === true || options.useNumericString === false) {
            c.setUseNumericString(options.useNumericString)
          }
        }

        // Calculate how many connections to create based on strategy
        let connectionsToCreate = 0
        const needed = options.ceiling - existing

        switch (options.scalingStrategy) {
          case 'gradual':
          // Create a fixed increment of connections
            connectionsToCreate = Math.min(options.scalingIncrement, needed)
            break

          case 'exponential': {
            // Create exponentially more connections based on current size
            const currentSize = idle.length + busyConnectionCount
            if (currentSize === 0) {
              // Start with at least floor connections or 1
              connectionsToCreate = Math.max(options.floor || 1, 1)
            } else {
              // Grow by factor, but cap at needed connections
              connectionsToCreate = Math.min(Math.ceil(currentSize * (options.scalingFactor - 1)), needed)
            }
            connectionsToCreate = Math.max(1, connectionsToCreate) // At least 1
            break
          }

          case 'aggressive':
          default:
          // Original behavior - create all needed connections at once
            connectionsToCreate = needed
            break
        }

        const toPromise = []

        // Create connections with optional delay between them
        async function createConnectionWithDelay (index) {
          if (index > 0 && options.scalingDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, options.scalingDelay))
          }

          ++pendingCreates
          return clientPromises.open(options.connectionString)
            .then(
              c => {
                --pendingCreates
                connectionOptions(c)
                checkin('grow', getDescription(c))
              },
              async e => {
                --pendingCreates
                return Promise.reject(e)
              }
            )
        }

        // Create connections based on strategy
        if (options.scalingDelay > 0 && options.scalingStrategy !== 'aggressive') {
          // Sequential creation with delays
          for (let i = 0; i < connectionsToCreate; ++i) {
            toPromise.push(createConnectionWithDelay(i))
          }
        } else {
          // Parallel creation (original behavior)
          for (let i = 0; i < connectionsToCreate; ++i) {
            toPromise.push(createConnectionWithDelay(0))
          }
        }

        const res = await Promise.all(toPromise)
        _this.emit('debug', `grow creates ${res.length} connections (strategy: ${options.scalingStrategy}) for pool idle = ${idle.length}, busy = ${busyConnectionCount}, pending = ${pendingCreates}, parkingConnectionCount = ${parkingConnectionCount}, existing = ${existing}`)
      }

      function open (cb) {
        if (opened) {
          return
        }
        grow().then(() => {
          if (cb) {
            cb(null, options)
          }

          if (options.heartbeatSecs) {
            hbTimer = setInterval(() => {
              park()
              heartbeat()
            }, heartbeatTickMs, _this)
            crank()
          }
          pollTimer = setInterval(() => {
            poll()
          }, 200, _this)
          opened = true
          _this.emit('open', options)
        }).catch(e => {
          if (cb) {
            cb(e, null)
          }
          sendError(e)
        })
      }

      function park () {
        const toParkIndex = idle.findIndex(description => {
          const inactivePeriod = description.keepAliveCount * options.heartbeatSecs
          return inactivePeriod >= options.inactivityTimeoutSecs
        })
        if (toParkIndex === -1) {
          return
        }
        const description = idle[toParkIndex]
        if (parkDescription(description)) {
          idle.splice(toParkIndex, 1)
        }
      }

      function promoteToFront (index) {
        if (index < 0 || index >= idle.length) {
          return
        }
        const description = idle[index]
        idle.splice(index, 1)
        idle.push(description)
      }

      function sendError (e, more) {
        if (_this.listenerCount('error') > 0) {
          _this.emit('error', e, more)
        }
      }

      function heartbeat () {
        const toHeartBeatIndex = idle.findIndex(d => new Date() - d.lastActive >= options.heartbeatSecs * 1000)
        if (toHeartBeatIndex === -1) {
          return
        }
        promoteToFront(toHeartBeatIndex)
        const description = checkout('heartbeat')
        const q = description.connection.query(options.heartbeatSql)
        q.on('column', (i, v) => {
          description.heartbeatResponse(v)
        })
        q.on('done', () => {
          description.heartbeat() // reset by user query
          checkin('heartbeat', description)
          const inactivePeriod = description.keepAliveCount * options.heartbeatSecs
          _this.emit('debug', `[${description.id}] heartbeat response = '${description.heartbeatSqlResponse}', ${description.lastActive.toLocaleTimeString()}` +
            `, keepAliveCount = ${description.keepAliveCount} inactivePeriod = ${inactivePeriod}, inactivityTimeoutSecs = ${options.inactivityTimeoutSecs}`)
        })
        q.on('error', (e) => {
          sendError(e)
          recreate(description)
        })
      }

      function parkDescription (description) {
        // need to leave at least floor connections in idle pool
        const canPark = Math.max(0, idle.length - options.floor)
        if (canPark === 0) {
          return false
        }
        _this.emit('debug', `[${description.id}] close connection and park due to inactivity parked = ${parked.length}, canPark = ${canPark}`)
        parkingConnectionCount++
        const connPromises = description.connection.promises
        connPromises.close().then(() => {
          parkingConnectionCount--
          description.park()
          parked.unshift(description)
          _this.emit('debug', `[${description.id}] closed connection and park due to inactivity parked = ${parked.length}, idle = ${idle.length}, busy = ${busyConnectionCount}`)
          _this.emit('status', getStatus(null, 'parked', 'parked'))
        }).catch(e => {
          sendError(e)
        })
        return true
      }

      function recreate (description) {
        _this.emit('debug', `recreate connection [${description.id}]`)
        const toPromise = []
        if (description.connection) {
          const promisedClose = description.connection.promises.close()
          toPromise.push(promisedClose)
        }
        void Promise.all(toPromise).then(() => {
          clientPromises.open(options.connectionString).then(conn => {
            description.recreate(conn)
            checkin('recreate', description)
          }).catch(e => {
            sendError(e)
          })
        })
      }

      function isClosed () {
        return closed
      }

      function close (cb) {
        if (hbTimer) {
          clearInterval(hbTimer)
        }
        if (pollTimer) {
          clearInterval(pollTimer)
        }
        // any parked connection will have been closed
        while (parked.length > 0) {
          parked.pop()
        }

        while (workQueue.length > 0) {
          workQueue.pop()
        }

        const toClosePromise = idle.map(description => description.connection.promises.close)
        Promise.all(toClosePromise).then(res => {
          _this.emit('debug', `closed ${res.length} connections due to pool shutdown busy = ${busyConnectionCount}`)
          _this.emit('close')
          if (cb) {
            cb()
          }
        }).catch(e => {
          if (cb) {
            cb()
          }
          sendError(e)
        }).finally(
          closed = true
        )
      }

      this.beginTransaction = beginTransaction
      this.commitTransaction = commitTransaction
      this.rollbackTransaction = rollbackTransaction
      this.open = open
      this.close = close
      this.query = query
      this.queryRaw = queryRaw
      this.callproc = callproc
      this.callprocAggregator = callprocAggregator
      this.getUserTypeTable = getUserTypeTable
      this.getTable = getTable
      this.getProc = getProc
      this.queryAggregator = queryAggregator
      this.promises = new PoolPromises(this)
      this.getUseUTC = getUseUTC
      this.setUseUTC = setUseUTC
      this.isClosed = isClosed
    }
  }

  return {
    Pool
  }
})()

exports.poolModule = poolModule
