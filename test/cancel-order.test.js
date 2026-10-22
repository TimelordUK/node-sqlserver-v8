'use strict'

// the order of an accepted cancel: every cancel callback (the cancel's own, and the
// refusal of any repeated cancel) comes before what the native call in flight brings back
// (HY008, done, free). no server: the connection is a stub, and the native result is a
// step handed to whenCancelSettled at the point in the event loop where CI saw it land.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const assert = require('chai').assert
const { notifyModule } = require('../lib/notifier')

// a statement with a handle, on a connection whose cancel calls back a tick on, as the
// driver's forwardCancel does
function statement ({ cancelThrows = false } = {}) {
  const notify = new notifyModule.StreamEvents()
  notify.setConn({
    cancelQuery: (n, cb) => {
      if (cancelThrows) throw new Error('[msnodesql] Connection is closed.')
      setImmediate(() => cb(null))
    },
    defaultCallback: () => {}
  })
  notify.setHandle({ connectionId: 1, statementId: 1 })
  return notify
}

function whenIdle () {
  return new Promise(resolve => setTimeout(resolve, 20))
}

describe('cancel order', function () {
  it('a native result before the refusal of a cancel from the cancel callback waits for it', async function handler () {
    // cancel/again-after-confirm-at-100: the result landed after the cancel callback, before
    // the refusal it queued
    const notify = statement()
    const seen = []
    notify.cancelQuery(e => {
      seen.push(e ? 'cancel-cb error' : 'cancel-cb ok')
      notify.cancelQuery(e2 => seen.push(e2 ? 'cancel-cb refused' : 'cancel-cb ok again'))
      process.nextTick(() => notify.whenCancelSettled(() => seen.push('HY008')))
    })
    await whenIdle()
    assert.deepEqual(seen, ['cancel-cb ok', 'cancel-cb refused', 'HY008'])
  })

  it('a native result before the cancel callback waits for it', async function handler () {
    const notify = statement()
    const seen = []
    notify.cancelQuery(() => seen.push('cancel-cb ok'))
    notify.whenCancelSettled(() => seen.push('HY008'))
    await whenIdle()
    assert.deepEqual(seen, ['cancel-cb ok', 'HY008'])
  })

  it('two cancels at once: both callbacks, then the result', async function handler () {
    // cancel/twice-streaming-at-100. which callback is first depends on when the driver's
    // cancel calls back; the result comes after both either way
    const notify = statement()
    const seen = []
    notify.cancelQuery(() => seen.push('cancel-cb ok'))
    notify.cancelQuery(e => seen.push(e ? 'cancel-cb refused' : 'cancel-cb ok again'))
    notify.whenCancelSettled(() => seen.push('HY008'))
    await whenIdle()
    assert.sameMembers(seen.slice(0, 2), ['cancel-cb ok', 'cancel-cb refused'])
    assert.deepEqual(seen.slice(2), ['HY008'])
  })

  it('with no cancel pending a native result runs at once', function handler () {
    const notify = statement()
    const seen = []
    notify.whenCancelSettled(() => seen.push('rows'))
    assert.deepEqual(seen, ['rows'])
  })

  it('a cancel that throws holds nothing', async function handler () {
    const notify = statement({ cancelThrows: true })
    const seen = []
    assert.throws(() => notify.cancelQuery(() => seen.push('cancel-cb')), /closed/)
    notify.whenCancelSettled(() => seen.push('HY008'))
    await whenIdle()
    assert.deepEqual(seen, ['HY008'])
  })
})
