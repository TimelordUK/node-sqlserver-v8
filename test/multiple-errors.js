//  ---------------------------------------------------------------------------------------------------------------------------------
// File: connect.js
// Contents: test suite for connections

// Copyright Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//  ---------------------------------------------------------------------------------------------------------------------------------

'use strict'

const chai = require('chai')
const expect = chai.expect
const assert = chai.assert

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('multiple-error', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => { done() })
  })

  this.afterEach(done => {
    env.close().then(() => { done() })
  })

  it('non trusted invalid user', done => {
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
