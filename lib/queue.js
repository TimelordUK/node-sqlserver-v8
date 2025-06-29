'use strict'

const queueModule = ((() => {
  const priorityQueue = require('./data-struture/priority-queue/PriorityQueue')
  class WorkItem {
    constructor (commandType, fn, args, operationId) {
      this.paused = false
      this.commandType = commandType
      this.fn = fn
      this.args = args
      this.operationId = operationId
    }

    run () {
      this.fn.apply(this.fn, this.args)
    }
  }

  class WorkQueue {
    constructor () {
      this.workQueue = new priorityQueue.PriorityQueue()
      this.operationId = 0
    }

    emptyQueue () {
      while (!this.workQueue.isEmpty()) {
        this.workQueue.poll()
      }
    }

    execQueueOp (op) {
      const peek = this.workQueue.peek()
      this.workQueue.add(op, op.operationId)
      if (peek == null || peek.paused) {
        op.run()
      }
    }

    enqueue (commandType, fn, args) {
      const id = this.operationId
      const op = new WorkItem(commandType, fn, args, id)
      ++this.operationId
      this.execQueueOp(op)
      return op
    }

    park (item) {
      this.workQueue.changePriority(item, Number.MAX_SAFE_INTEGER)
      item.paused = true
      const peek = this.workQueue.peek()
      if (!peek.paused) {
        this.nextOp()
      }
    }

    resume (item) {
      this.workQueue.changePriority(item, item.operationId)
      item.paused = false
    }

    dropItem (item) {
      return this.workQueue.remove(item)
    }

    exec () {
      const op = this.workQueue.peek()
      if (op && !op.paused) {
        op.run()
      }
    }

    nextOp () {
      this.workQueue.remove(this.workQueue.peek())
      this.exec()
    }

    length () {
      return this.workQueue.length()
    }

    pushRange (ops) {
      while (ops.length > 0) {
        const op = ops.pop()
        this.workQueue.add(op, op.operationId)
      }
    }

    moveUntil (primitive, ops) {
      const workQueue = this.workQueue
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
      return ret
    }

    first (primitive) {
      const ops = []
      const ret = this.moveUntil(primitive, ops)
      this.pushRange(ops)
      return ret
    }

    peek () {
      return this.workQueue.peek()
    }
  }

  return {
    WorkQueue
  }
})())

// encapsulate operation management - used by driver manager to queue work to the c++ driver.
// note that item[0] is live with the c++ and remains until the statement is complete.

exports.queueModule = queueModule
