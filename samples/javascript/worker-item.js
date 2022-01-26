const { parentPort } = require('worker_threads')
let queryId = 0

parentPort.on('message', msg => {
  switch (msg.command) {
    case 'task': {
      const query = ++queryId
      console.log(`worker receive task ${msg.num}`)
      // let main master thread run query on pool and post back results
      parentPort.postMessage(
        {
          query_id: query,
          sql: `select ${msg.num} as i, @@SPID as spid`,
          command: 'sql_query',
          data: msg.num
        })
    }
      break
    // now we have sql results run expensive calc
    case 'sql_result': {
      parentPort.postMessage(
        {
          command: 'task_result',
          data: `spid ${msg.rows[0].spid}`,
          num: msg.data,
          fib: getFib(msg.data)
        })
    }
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
