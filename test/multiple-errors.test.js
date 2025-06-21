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

describe('multiple-error', function () {
  this.timeout(50000)
  this.beforeEach(async function () {
    sql.logger.info('Starting test setup', 'params.test.beforeEach')
    await env.open()
    sql.logger.info('Test environment opened successfully', 'params.test.beforeEach')
  })

  this.afterEach(async function () {
    sql.logger.info('Starting test cleanup', 'params.test.afterEach')
    await env.close()
    sql.logger.info('Test environment closed successfully', 'params.test.afterEach')
  })
  it.skip('non trusted invalid user', done => {
    let adjusted = env.connectionString.replace('Trusted_Connection=yes', 'Trusted_Connection=No;Uid=test;Database=test;Pwd=...')
    adjusted = adjusted.replace('UID=linux', 'Uid=linux2')
    adjusted = adjusted.replace('Uid=sa', 'Uid=JohnSnow')
    adjusted = adjusted.replace('Uid=SA', 'Uid=JohnSnow')
    env.sql.open(adjusted,
      err => {
        assert(err)
        assert(err.message.indexOf('Login failed for user') > 0)
        done()
      })
  })

  it('select then use print statement capture print - using promise query', async function handler () {
    const res = await env.theConnection.promises.query('select 1 as one; print \'hello world!\'')
    expect(res.info[0]).to.equal('hello world!')
    const expectedMeta = {
      size: 10,
      name: 'one',
      nullable: false,
      type: 'number',
      sqlType: 'int'
    }
    expect(res.first[0].one).to.equal(1)
    expect(res.meta[0][0]).to.deep.equal(expectedMeta)
  })

  it('select then use print statement capture print', done => {
    const q = env.theConnection.query('select 1 as one; print \'hello world!\'')
    const errors = []
    const info = []
    const rows = []
    let currentRow = []
    let metadata = null
    let lastColumn = 0

    const expectedInfo = [
      {
        sqlstate: '01000',
        code: 0,
        message: `[Microsoft][${env.driver}][SQL Server]hello world!`
      }
    ]
    q.on('error', e => {
      errors.push(e)
    })

    q.on('info', m => {
      info.push({
        sqlstate: m.sqlstate,
        code: m.code,
        message: m.message
      })
    })

    q.on('done', () => {
      expect(expectedInfo).to.deep.equal(info)
      expect(errors.length).to.equal(0)
      expect(rows.length).to.equal(1)
      expect(rows).to.deep.equal([
        [
          1
        ]
      ])
      done()
    })

    q.on('meta', (meta) => {
      metadata = meta
      currentRow = [metadata.length]
      lastColumn = metadata.length - 1
    })

    q.on('column', (index, data) => {
      currentRow[index] = data
      if (index === lastColumn) {
        rows.push(currentRow)
        currentRow = [metadata.length]
      }
    })
  })

  it('use print statement capture print', done => {
    const q = env.theConnection.query('print \'hello world!\'; select 1 as one')
    const errors = []
    const info = []
    const rows = []
    let currentRow = []
    let metadata = null
    let lastColumn = 0

    const expectedInfo = [
      {
        sqlstate: '01000',
        code: 0,
        message: `[Microsoft][${env.driver}][SQL Server]hello world!`
      }
    ]
    q.on('error', e => {
      errors.push(e)
    })

    q.on('info', m => {
      info.push({
        sqlstate: m.sqlstate,
        code: m.code,
        message: m.message
      })
    })

    q.on('done', () => {
      expect(expectedInfo).to.deep.equal(info)
      expect(errors.length).to.equal(0)
      expect(rows.length).to.equal(1)
      expect(rows).to.deep.equal([
        [
          1
        ]
      ])
      done()
    })

    q.on('meta', (meta) => {
      metadata = meta
      currentRow = [metadata.length]
      lastColumn = metadata.length - 1
    })

    q.on('column', (index, data) => {
      currentRow[index] = data
      if (index === lastColumn) {
        rows.push(currentRow)
        currentRow = [metadata.length]
      }
    })
  })

  it('callback multiple errors', done => {
    const errors = []
    env.theConnection.query('select a;select b;', (err, res, more) => {
      if (err) {
        errors.push(err.message)
      }
      if (!more) {
        assert.deepStrictEqual([
          `[Microsoft][${env.driver}][SQL Server]Invalid column name 'a'.`,
          `[Microsoft][${env.driver}][SQL Server]Invalid column name 'b'.`
        ], errors)
        done()
      }
    })
  })

  it('multiple errors - use promise', async function handler () {
    try {
      await env.theConnection.promises.query('select a;select b;')
    } catch (e) {
      expect(e).haveOwnProperty('_results')
      const res = e._results
      // eslint-disable-next-line no-unused-expressions
      expect(res.errors.length).to.equal(2)
      expect(res.errors[0].message).include('Invalid column name \'a\'')
      expect(res.errors[1].message).include('Invalid column name \'b\'')
    }
  })

  it('event based multiple errors', done => {
    const errors = []
    let callbacks = 0
    const q = env.theConnection.query('select a;select b;')
    q.on('error', (err, more) => {
      ++callbacks
      errors.push(err.message)
      if (!more) {
        assert.deepStrictEqual(callbacks, 2)
        assert.deepStrictEqual([
          `[Microsoft][${env.driver}][SQL Server]Invalid column name 'a'.`,
          `[Microsoft][${env.driver}][SQL Server]Invalid column name 'b'.`
        ], errors)
        done()
      }
    })
  })
})
