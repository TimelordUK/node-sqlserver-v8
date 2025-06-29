
const path = require('path')
const filePath = path.resolve(__dirname, './worker-item.js')
const { Worker } = require('worker_threads')

const worker1 = new Worker(filePath)
const worker2 = new Worker(filePath)

function dispatch (worker) {
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
      num
    })
}

function clean () {
  setTimeout(async () => {
    console.log('exit.')
    await Promise.all([
      worker1.terminate(),
      worker2.terminate()
    ])
  }, 5000)
}

for (let i = 0; i < 40; i += 2) {
  sendTask(worker1, i)
  sendTask(worker2, i + 1)
}

clean()
