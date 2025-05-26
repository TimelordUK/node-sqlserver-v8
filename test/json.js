'use strict'

/* globals describe it */
const chai = require('chai')
const expect = chai.expect
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('json', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => {
      done()
    }).catch(e => {
      console.error(e)
    })
  })

  this.afterEach(done => {
    env.close().then(() => { done() }).catch(e => {
      console.error(e)
    })
  })

  function insertRec (p, id, element) {
    const txt = JSON.stringify(element, null, 4)
    return p.promises.call({
      ID: id++,
      json: txt
    }).then(() => {
      return txt
    })
  }

  it('use proc to insert a JSON array and bulk parse on server', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promises = env.theConnection.promises
    const json = JSON.stringify(parsedJSON, null, 4)
    const res = await promises.callProc(procNameJson, { json })
    expect(Array.isArray(res.first))
    const expected = parsedJSON.map(r => {
      const { OrganizationNode, ...rest } = r
      return rest
    })
    expect(res.first).to.deep.equals(expected)
  })

  it('use proc to insert a JSON based complex object', async function handler () {
    const tableName = 'employeeJson'
    const procName = 'AddUpdateEmployeeJsonRecord'
    const procNameJson = 'ParseJsonArray'
    const h = env.jsonHelper(tableName, procName, procNameJson)
    await h.create()
    const parsedJSON = env.helper.getJSON()
    const promises = env.theConnection.promises
    const p = await promises.getProc(procName)
    let id = 0
    const inserts = parsedJSON.map(r => insertRec(p, id++, r))
    const expected = await Promise.all(inserts)
    const selectedRecords = await promises.query(`select * from ${tableName} order by id asc`)
    const selected = selectedRecords.first.map(rec => rec.json)
    expect(selected).to.deep.equals(expected)
  })
})
