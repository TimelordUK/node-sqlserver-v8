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
      const peek = workQueue.peek()
      workQueue.add(op, op.operationId)
      if (!peek || peek.paused) {
        op.fn.apply(op.fn, op.args)
      }
    }

    function enqueue (commandType, fn, args) {
      const op = {
        commandType,
        fn,
        args,
        operationId,
        paused: false
      }
      ++operationId
      execQueueOp(op)
      return op
    }

    function park (item) {
      workQueue.changePriority(item, Number.MAX_SAFE_INTEGER)
      item.paused = true
      const peek = workQueue.peek()
      if (!peek.paused) {
        nextOp()
      }
    }

    function resume (item) {
      workQueue.changePriority(item, item.operationId)
      item.paused = false
    }

    function dropItem (item) {
      return workQueue.remove(item)
    }

    function exec () {
      const op = workQueue.peek()
      if (op && !op.paused) {
        op.fn.apply(op.fn, op.args)
      }
    }

    function nextOp () {
      workQueue.remove(workQueue.peek())
      exec()
    }

    function length () {
      return workQueue.length()
    }

    function first (primitive) {
      const ops = []
      let ret = null
      while (!workQueue.isEmpty()) {
        const op = workQueue.peek()
        if (primitive(op.operationId, op)) {
          ret = op
          break
        }
        const peek = workQueue.peek()
        workQueue.remove(peek)
        ops.push(peek)
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

    return {
      resume,
      park,
      peek,
      exec,
      first,
      dropItem,
      nextOp,
      emptyQueue,
      enqueue,
      length
    }
  }

  return {
    WorkQueue
  }
})())

// encapsulate operation management - used by driver manager to queue work to the c++ driver.
// note that item[0] is live with the c++ and remains until the statement is complete.

exports.queueModule = queueModule
