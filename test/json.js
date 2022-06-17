'use strict'

const util = require('util')

/* globals describe it */

const assert = require('chai').assert
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('json', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  function insertRec (p, id, element) {
    return new Promise((resolve, reject) => {
      const txt = JSON.stringify(element, null, 4)
      p.call({
        ID: id++,
        json: txt
      }, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve(txt)
        }
      })
    })
  }

  it('use proc to insert a JSON array and bulk parse on server', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promisedGetProc = env.theConnection.promises.getProc
    const p = await promisedGetProc(procNameJson)
    const json = JSON.stringify(parsedJSON, null, 4)
    const promisedCall = util.promisify(p.call)
    const res = await promisedCall({
      json
    })
    assert(res)
    assert(Array.isArray(res))
  })

  it('use proc to insert a JSON based complex object', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promisedGetProc = env.theConnection.promises.getProc
    const p = await promisedGetProc(procName)
    let id = 0
    const promises = parsedJSON.map(r => insertRec(p, id++, r))
    const expected = await Promise.all(promises)
    const promisedQuery = env.theConnection.promises.query
    const selectedRecords = await promisedQuery(`select * from ${tableName} order by id asc`)
    const selected = selectedRecords.first.map(rec => rec.json)
    assert.deepStrictEqual(expected, selected)
  })
})
