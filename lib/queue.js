'use strict'

const queueModule = ((() => {
  const priorityQueue = require('./data-struture/priority-queue/PriorityQueue')
  const { Comparator } = require('./data-struture/utils/comparator/Comparator')
  // items are compared by identity, never by priority
  const byIdentity = new Comparator((a, b) => a === b ? 0 : 1)
  class WorkItem {
    constructor (commandType, fn, args, operationId) {
      this.paused = false
      this.commandType = commandType
      this.fn = fn
      this.args = args
      this.operationId = operationId
      this.priority = operationId
    }

    run () {
      this.fn.apply(this.fn, this.args)
    }
  }

  class WorkQueue {
    constructor () {
      this.workQueue = new priorityQueue.PriorityQueue()
      this.operationId = 0
      this.followUps = 0
    }

    emptyQueue () {
      while (!this.workQueue.isEmpty()) {
        this.workQueue.poll()
      }
    }

    // one item at a time: a new item starts now only if nothing else is queued
    execQueueOp (op) {
      const peek = this.workQueue.peek()
      this.workQueue.add(op, op.priority)
      if (peek == null) {
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

    // work that finishes off the item at the head (its statement's unbind and free) runs
    // straight after it, before anything that was already waiting behind it.
    enqueueFollowUp (commandType, fn, args) {
      const head = this.workQueue.peek()
      if (!head) return this.enqueue(commandType, fn, args)
      const op = new WorkItem(commandType, fn, args, this.operationId++)
      op.priority = head.priority + (++this.followUps) / 1e6
      this.execQueueOp(op)
      return op
    }

    // a paused query holds the connection: it keeps its place at the head, and work
    // queued behind it waits until it is resumed and finished, or cancelled.
    park (item) {
      item.paused = true
    }

    resume (item) {
      item.paused = false
    }

    has (item) {
      return item != null && this.workQueue.find(item, byIdentity).length > 0
    }

    dropItem (item) {
      if (this.has(item)) this.workQueue.remove(item, byIdentity)
    }

    // the owner of an item says it is finished: remove that item, and if it was the
    // head, start the next. finishing an item twice, or one already gone, does nothing -
    // it must never remove, or start, someone else's work.
    finish (item) {
      if (!this.has(item)) return
      const wasHead = this.workQueue.peek() === item
      this.workQueue.remove(item, byIdentity)
      if (wasHead) {
        this.followUps = 0
        this.exec()
      }
    }

    exec () {
      const op = this.workQueue.peek()
      if (op) {
        op.run()
      }
    }

    length () {
      return this.workQueue.length()
    }

    pushRange (ops) {
      while (ops.length > 0) {
        const op = ops.pop()
        this.workQueue.add(op, op.priority)
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
