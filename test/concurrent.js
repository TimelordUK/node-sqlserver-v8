'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('concurrent', function () {
  this.timeout(10000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('open connections in sequence and prove distinct connection objects created', testDone => {
    const connections = []

    open(conn1 => {
      connections.push(conn1)
      open(conn2 => {
        connections.push(conn2)
        open(conn3 => {
          connections.push(conn3)
          done()
        })
      })
    })

    function done () {
      const c0 = connections[0]
      const c1 = connections[1]
      const c2 = connections[2]

      const t1 = c0 === c1 && c1 === c2
      assert(t1 === false)
      assert(c0.id !== c1.id)
      assert(c1.id !== c2.id)

      const clean = [
        asyncDone => {
          c0.close(() => {
            asyncDone()
          })
        },
        asyncDone => {
          c1.close(() => {
            asyncDone()
          })
        },
        asyncDone => {
          c2.close(() => {
            asyncDone()
          })
        }
      ]

      env.async.series(clean, () => {
        testDone()
      })
    }
  })

  const open = done => {
    env.sql.open(env.connectionString, (err, conn) => {
      assert(err === false)
      done(conn)
    })
  }

  it('check for blocked calls to api with event emission', testDone => {
    const delays = []
    const start = Date.now()
    const expected = ['a', 'b', 'c', 'd']
    const seq = []

    function test () {
      assert.deepStrictEqual(expected, seq)
      testDone()
    }

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        test()
      }
    }

    const req = env.theConnection.query('waitfor delay \'00:00:02\';')
    req.on('done', () => {
      pushTest('a')
      process.nextTick(() => {
        pushTest('b')
      })
      setImmediate(() => {
        pushTest('d')
      })
      process.nextTick(() => {
        pushTest('c')
      })
    })
  })

  it('check for blocked calls to api', testDone => {
    const seq = []
    const delays = []
    const start = Date.now()
    const expected = ['a', 'b', 'c', 'd', 'e']

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        assert.deepStrictEqual(expected, seq)
        testDone()
      }
    }

    pushTest('a')
    process.nextTick(() => {
      pushTest('c')
    })

    env.theConnection.query('waitfor delay \'00:00:02\';', () => {
      pushTest('e')
    })

    pushTest('b')
    process.nextTick(() => {
      pushTest('d')
    })
  })

  it('check for blocked calls to api with nested query', testDone => {
    const seq = []
    const delays = []
    const start = Date.now()
    const expected = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        assert.deepStrictEqual(expected, seq)
        testDone()
      }
    }

    pushTest('a')
    process.nextTick(() => {
      pushTest('c')
    })
    env.theConnection.query('waitfor delay \'00:00:02\';', [], () => {
      pushTest('e')
      pushTest('f')
      process.nextTick(() => {
        pushTest('h')
      })
      env.theConnection.query('waitfor delay \'00:00:02\';', [], () => {
        pushTest('j')
      })
      pushTest('g')
      process.nextTick(() => {
        pushTest('i')
      })
    })
    pushTest('b')
    process.nextTick(() => {
      pushTest('d')
    })
  })

  it('open connections simultaneously and prove distinct connection objects created', testDone => {
    const connections = []

    open(conn1 => {
      connections.push(conn1)
      if (connections.length === 3) done()
    })

    open(conn2 => {
      connections.push(conn2)
      if (connections.length === 3) done()
    })

    open(conn3 => {
      connections.push(conn3)
      if (connections.length === 3) done()
    })

    function done () {
      const c0 = connections[0]
      const c1 = connections[1]
      const c2 = connections[2]

      const t1 = c0 === c1 && c1 === c2
      assert(t1 === false)
      assert(c0.id !== c1.id)
      assert(c1.id !== c2.id)

      const clean = [
        asyncDone => {
          c0.close(() => {
            asyncDone()
          })
        },
        asyncDone => {
          c1.close(() => {
            asyncDone()
          })
        },
        asyncDone => {
          c2.close(() => {
            asyncDone()
          })
        }
      ]

      env.async.series(clean, () => {
        testDone()
      })
    }
  })

  it('make sure two concurrent connections each have unique spid ', testDone => {
    let spid1
    let spid2

    open(c1 => {
      open(c2 => {
        c1.query('select @@SPID as id, CURRENT_USER as name', (err, res) => {
          assert.ifError(err)
          assert(res.length === 1)
          spid1 = res[0].id
          assert(spid1 !== null)

          c2.query('select @@SPID as id, CURRENT_USER as name', (err, res) => {
            assert.ifError(err)
            assert(res.length === 1)
            spid2 = res[0].id
            assert(spid2 !== null)
            assert(spid1 !== spid2)

            const clean = [

              asyncDone => {
                c1.close(() => {
                  asyncDone()
                })
              },
              asyncDone => {
                c2.close(() => {
                  asyncDone()
                })
              }
            ]

            env.async.series(clean, () => {
              testDone()
            })
          })
        })
      })
    })
  })
})
