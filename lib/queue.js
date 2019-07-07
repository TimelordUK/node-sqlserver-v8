'use strict'

const queueModule = ((() => {
  const priorityQueue = require('./data-struture/priority-queue/PriorityQueue')
  function WorkQueue () {
    const workQueue = new priorityQueue.PriorityQueue()
    let operationId = 0

    function emptyQueue () {
      while (!workQueue.isEmpty()) {
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

    function dropItem (item) {
      return workQueue.remove(item)
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
      return workQueue.length()
    }

    function first (primitive) {
      const ops = []
      let ret = null
      while (!workQueue.isEmpty()) {
        let op = workQueue.peek()
        if (primitive(op.operationId, op)) {
          ret = op
          break
        }
        ops.push(workQueue.poll())
      }
      while (ops.length > 0) {
        const op = ops.pop()
        workQueue.add(op, op.operationId)
      }
      return ret
    }

    function peek () {
      return workQueue.peek()
    }

    function get (operationId) {
      return workQueue.find(operationId)
    }

    return {
      peek: peek,
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
