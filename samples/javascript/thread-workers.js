
const path = require('path')
const filePath = path.resolve(__dirname, './worker-item.js')
const sql = require('msnodesqlv8')
const { Worker } = require('worker_threads')

// Create new workers
const worker1 = new Worker(filePath)
const worker2 = new Worker(filePath)

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, 'config.json'))
  return config.connection.local
}

const connectionString = getConnection()

class SqlWorkerServer {
  constructor (cs) {
    this.connectionString = cs
    this.pool = new sql.Pool({
      connectionString: cs
    })
    this.pool.on('open', (options) => {
      console.log(`ready options = ${JSON.stringify(options, null, 4)}`)
    })

    this.pool.on('debug', msg => {
      // console.log(`\t\t\t\t\t\t${new Date().toLocaleTimeString()} <pool.debug> ${msg}`)
    })

    this.pool.on('status', s => {
      // console.log(`status = ${JSON.stringify(s, null, 4)}`)
    })

    this.pool.on('error', e => {
      console.log(e)
    })
  }

  async start () {
    await this.pool.open()
  }

  async stop () {
    await this.pool.close()
  }

  subscribe (worker) {
    worker.on('message', msg => {
      switch (msg.command) {
        case 'sql_query': {
          console.log(`main: request to exec sql ${msg.sql}`)
          this.pool.query(msg.sql, (e, res) => {
            worker.postMessage(
              {
                data: msg.data,
                query_id: msg.query_id,
                command: 'sql_result',
                rows: res,
                error: e
              })
          })
          break
        }
      }
    })
  }
}

const server = new SqlWorkerServer(connectionString)
server.start()

function dispatch (worker) {
  server.subscribe(worker)

  worker.on('message', msg => {
    switch (msg.command) {
      case 'task_result': {
        console.log(JSON.stringify(msg, null, 4))
      }
    }
  })

  worker.on('error', error => {
    console.log(error)
  })
}

dispatch(worker1)
dispatch(worker2)

function sendTask (worker, num) {
  worker.postMessage(
    {
      command: 'task',
      num: num
    })
}

function clean () {
  setTimeout(async () => {
    console.log('exit.')
    await Promise.all([
      server.stop(),
      worker1.terminate(),
      worker2.terminate()
    ])
  }, 5000)
}

sendTask(worker1, 40)
sendTask(worker2, 10)
sendTask(worker2, 20)

clean()
