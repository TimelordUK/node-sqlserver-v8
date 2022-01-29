const { parentPort } = require('worker_threads')
const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString

parentPort.on('message', async msg => {
  switch (msg.command) {
    case 'task': {
      console.log(`worker receive task ${msg.num}`)
      const conn = await sql.promises.open(connectionString)
      const query = `select ${msg.num} as i, @@SPID as spid`
      const res = await conn.promises.query(query)
      await conn.promises.close()
      parentPort.postMessage(
        {
          command: 'task_result',
          data: `spid ${res.first[0].spid}`,
          num: msg.num,
          fib: getFib(msg.num)
        })
    }
      break
  }
})

function getFib (num) {
  if (num === 0) {
    return 0
  } else if (num === 1) {
    return 1
  } else {
    return getFib(num - 1) + getFib(num - 2)
  }
}
