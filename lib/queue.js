'use strict'

const queueModule = ((() => {
  const priorityQueue = require('./data-struture/priority-queue/PriorityQueue')
  function WorkQueue () {
    const workQueue = new priorityQueue.PriorityQueue()
    let operationId = 0

    function emptyQueue () {
      while (workQueue.peek()) {
        workQueue.poll()
      }
    }

    function execQueueOp (op) {
      const empty = workQueue.isEmpty()
      workQueue.add(op, op.operationId)
      if (empty) {
        op.fn.apply(op.fn, op.args)
      }
    }

    function enqueue (commandType, fn, args) {
      const op = {
        commandType: commandType,
        fn: fn,
        args: args,
        operationId: operationId
      }
      ++operationId
      execQueueOp(op)
      return op.operationId
    }

    function dropItem (i) {
      for (let j = i; j < workQueue.length - 1; j += 1) {
        workQueue[j] = workQueue[j + 1]
      }
      return workQueue.pop()
    }

    function exec () {
      const op = workQueue.peek()
      if (op) {
        op.fn.apply(op.fn, op.args)
      }
    }

    function nextOp () {
      workQueue.poll()
      exec()
    }

    function length () {
      return workQueue.length
    }

    function first (primitive) {
      for (let i = 0; i < workQueue.length; i += 1) {
        const item = workQueue[i]
        if (primitive(i, item)) {
          return item
        }
      }
      return null
    }

    function get (i) {
      return workQueue[i]
    }

    return {
      exec: exec,
      first: first,
      dropItem: dropItem,
      nextOp: nextOp,
      emptyQueue: emptyQueue,
      enqueue: enqueue,
      length: length,
      get: get
    }
  }

  return {
    WorkQueue: WorkQueue
  }
})())

// encapsulate operation management - used by driver manager to queue work to the c++ driver.
// note that item[0] is live with the c++ and remains until the statement is complete.

exports.queueModule = queueModule
