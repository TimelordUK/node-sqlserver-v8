'use strict'

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test

configureTestLogging(sql)

describe('txn', function () {
  this.timeout(50000)
  this.beforeEach(async function () {
    sql.logger.info('Starting test setup', 'txn.test.beforeEach')
    await env.open()
    sql.logger.info('Test environment opened successfully', 'txn.test.beforeEach')
  })

  this.afterEach(async function () {
    sql.logger.info('Starting test cleanup', 'txn.test.afterEach')
    await env.close()
    sql.logger.info('Test environment closed successfully', 'txn.test.afterEach')
  })

  const txnTableDef = {
    tableName: 'test_txn',
    columns: [
      {
        name: 'id',
        type: 'int identity'
      },
      {
        name: 'name',
        type: 'VARCHAR (100)'
      }
    ]
  }

  const activityTableDef = {
    tableName: 'test_txn_sales',
    columns: [
      {
        name: 'activity_id',
        type: 'INT PRIMARY KEY'
      },
      {
        name: 'activity_name',
        type: 'VARCHAR (255) NOT NULL'
      }
    ]
  }

  it('setup for tests', async function handler () {
    // single setup necessary for the test
    const tester = env.bulkTableTest(txnTableDef)
    await tester.create()
  })

  async function insertViolationRunner (helper) {
    return new Promise((resolve, reject) => {
      const q = env.theConnection.query(helper.insertParamsSql, [1, 'sprinting'])
      const errors = []
      q.on('error', (err, more) => {
        errors.push(err)
        if (more) return
        const msgs = errors.map(e => e.message)
        if (msgs.length !== 1) {
          reject(new Error('bad error count'))
        }
        if (!msgs[0].includes('Violation of PRIMARY KEY')) {
          reject(new Error(err))
        }
      })

      q.on('info', i => {
        const msg = i.message
        expect(msg).to.include('statement has been terminated')
      })

      q.on('free', async function handler () {
        env.theConnection.rollback(err => {
          if (err) {
            reject(err)
          } else {
            resolve(null)
          }
        })
      })
    })
  }

  async function t0 () {
    const helper = env.bulkTableTest(activityTableDef)
    await helper.create()
    const promises = env.theConnection.promises
    await promises.beginTransaction()
    await promises.query(helper.insertParamsSql, [1, 'jogging'])
    await insertViolationRunner(helper)
    const res = await promises.query(helper.selectSql)
    expect(res.first).to.deep.equal([])
    return helper
  }

  async function insertThreeActivity (helper) {
    const promises = env.theConnection.promises
    await promises.query(helper.insertParamsSql, [1, 'jogging'])
    await promises.query(helper.insertParamsSql, [2, 'sprinting'])
    await promises.query(helper.insertParamsSql, [3, 'walking'])
  }

  it('begin a transaction and use streaming with error on constraint to trigger rollback detection', async function handler () {
    await t0()
  })

  const expectedThreeActivity = [
    {
      activity_id: 1,
      activity_name: 'jogging'
    },
    {
      activity_id: 2,
      activity_name: 'sprinting'
    },
    {
      activity_id: 3,
      activity_name: 'walking'
    }
  ]

  it('begin a transaction and rollback on violation and insert valid', async function handler () {
    const helper = await t0()

    // rolled back earlier to 0 rows
    await insertThreeActivity(helper)

    const results = await env.theConnection.promises.query(helper.selectSql)
    expect(results.first).to.deep.equal(expectedThreeActivity)
  })

  it('begin a transaction and add two rows no constraint violation, commit and check', async function handler () {
    const helper = env.bulkTableTest(activityTableDef)
    await helper.create()
    const promises = env.theConnection.promises
    await promises.beginTransaction()
    await insertThreeActivity(helper)
    await promises.commit()
    const results = await promises.query(helper.selectSql)
    expect(results.first).to.deep.equal(expectedThreeActivity)
  })

  it('begin a transaction and rollback with no query', async function handler () {
    const helper = env.bulkTableTest(activityTableDef)
    const promises = env.theConnection.promises
    await helper.create()
    await promises.beginTransaction()
    await promises.rollback()
  })

  it('begin a transaction and rollback with no query and no callback', done => {
    try {
      env.theConnection.beginTransaction()
      env.theConnection.rollback(err => {
        assert.ifError(err)
        done()
      })
    } catch (e) {
      assert(e === false)
    }
  })

  async function t1 () {
    const tester = env.bulkTableTest(txnTableDef)
    await tester.drop()
    await tester.create()
    const promises = env.theConnection.promises
    await promises.beginTransaction()
    await promises.query(`${tester.insertSql} ('Anne')`)
    await promises.query(`${tester.insertSql} ('Bob')`)
    await promises.commit()
    return tester
  }

  const expectedMeta = [
    {
      name: 'id',
      size: 10,
      nullable: false,
      type: 'number',
      sqlType: 'int identity'
    },
    {
      name: 'name',
      size: 100,
      nullable: true,
      type: 'text',
      sqlType: 'varchar'
    }
  ]

  const expected =
    [
      [1, 'Anne'],
      [2, 'Bob']
    ]

  it('begin a transaction and commit', async function handler () {
    const tester = await t1()
    const promises = env.theConnection.promises
    const res = await promises.query(tester.selectSql, [], { raw: true })

    expect(res.meta[0]).to.deep.equal(expectedMeta)
    expect(res.first).to.deep.equal(expected)
  })

  it('begin a transaction and rollback', async function handler () {
    const tester = await t1()
    const promises = env.theConnection.promises
    await promises.beginTransaction()
    await promises.query(`${tester.insertSql} ('Carl')`)
    await promises.query(`${tester.insertSql} ('Dana')`)
    await promises.rollback()
    const res = await promises.query(tester.selectSql, [], { raw: true })

    expect(res.meta[0]).to.deep.equal(expectedMeta)
    expect(res.first).to.deep.equal(expected)
  })

  it('begin a transaction and then query with an error', async function handler () {
    const tester = await t1()
    const promises = env.theConnection.promises
    await promises.beginTransaction()

    try {
      await promises.query('INSERT INTO test_txn (name) VALUES (\'Carl\')\'m with STUPID')
    } catch (err) {
      assert(err.message.includes('Unclosed quotation mark after the character string'))
    } finally {
      await promises.rollback()
    }

    const res = await promises.query(tester.selectSql, [], { raw: true })
    expect(res.meta[0]).to.deep.equal(expectedMeta)
    expect(res.first).to.deep.equal(expected)
  })
})
