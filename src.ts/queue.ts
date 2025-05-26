/**
 * Task to be executed in the connection queue
 */
export interface QueueTask {
  execute: (done: () => void) => void
  fail: (err: Error) => void
  promise?: Promise<any>
}

export class AsyncQueue {
  private readonly _queue: QueueTask[] = []
  private _busy = false
  private _closed = false

  stop () {
    this._closed = true
  }

  size (): number {
    return this._queue.length
  }

  /**
   * Allows statements to enqueue tasks on this connection
   * This maintains the single-threaded queue while moving logic to Statement
   */
  async enqueueTask<T>(task: QueueTask): Promise<T> {
    return this._enqueue<T>(task)
  }

  /**
   * Execute the next task in the queue if not busy
   */
  private _executeNext (): void {
    if (this._queue.length === 0 || this._busy || this._closed) {
      return
    }

    this._busy = true
    const task = this._queue[0]

    try {
      task.execute(() => {
        this._queue.shift() // Remove the completed task
        this._busy = false
        this._executeNext() // Check for more tasks
      })
    } catch (err: any) {
      // Handle unexpected errors
      task.fail(err)
      this._queue.shift()
      this._busy = false
      this._executeNext()
    }
  }

  /**
   * Add a task to the execution queue
   */

  private async _enqueue<T>(task: QueueTask): Promise<T> {
    if (this._closed) {
      const err = new Error('Connection is closed')
      task.fail(err)
      return Promise.reject(err)
    }

    // Create a promise if not already defined
    if (!task.promise) {
      task.promise = new Promise<T>((resolve, reject) => {
        const originalExecute = task.execute
        const originalFail = task.fail

        // Override execute to resolve the promise
        task.execute = (done) => {
          originalExecute(() => {
            resolve(undefined as any)
            done()
          })
        }

        // Override fail to reject the promise
        task.fail = (err) => {
          originalFail(err)
          reject(err)
        }
      })
    }

    this._queue.push(task)
    this._executeNext()
    return task.promise as Promise<T>
  }
}
