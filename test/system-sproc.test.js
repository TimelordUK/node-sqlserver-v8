'use strict'

/**
 * Regression tests for issue #327 - "Execute system stored procedure"
 * https://github.com/TimelordUK/node-sqlserver-v8/issues/327
 *
 * System procedures (sys.sp_cdc_change_job, sys.sp_who ...) physically live in the
 * hidden mssqlsystemresource database and carry a negative object_id. They are therefore
 * absent from sys.objects / sys.parameters, which only expose objects owned by the
 * current database. proc_describe.sql used those two views, so describing a system
 * proc yielded zero rows - the bound proc ended up with only the synthetic @returns
 * param and any call failed with "illegal params on param object = ...".
 *
 * sys.all_objects / sys.all_parameters are the union of the user and system catalogs,
 * so switching to them lets system procs bind. These tests pin that behaviour and
 * guard the ordinary user-proc path against regression.
 */

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const expect = chai.expect

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

configureTestLogging(sql)

describe('system-sproc', function () {
  this.timeout(60000)

  this.beforeEach(async function () {
    await env.open()
  })

  this.afterEach(async function () {
    await env.close()
  })

  function describeProc (name) {
    const pm = env.theConnection.procedureMgr()
    return new Promise((resolve, reject) => {
      pm.describeProcedure(name, (err, results) => {
        if (err) reject(err)
        else resolve(results)
      })
    })
  }

  function getProc (name) {
    const pm = env.theConnection.procedureMgr()
    return new Promise(resolve => pm.get(name, proc => resolve(proc)))
  }

  // the exact proc from the issue report - 7 params, none of which were visible before
  it('describe sys.sp_cdc_change_job - system proc params resolve', async function () {
    const results = await describeProc('sys.sp_cdc_change_job')
    const names = results.map(p => p.name)

    // before the fix this was ['@returns'] only
    expect(names).to.deep.equal([
      '@returns',
      '@job_type',
      '@maxtrans',
      '@maxscans',
      '@continuous',
      '@pollinginterval',
      '@retention',
      '@threshold'
    ])
  })

  it('describe sys.sp_cdc_change_job - types and metadata are correct', async function () {
    const results = await describeProc('sys.sp_cdc_change_job')
    const byName = results.reduce((agg, p) => { agg[p.name] = p; return agg }, {})

    expect(byName['@job_type'].type_id).to.equal('nvarchar')
    expect(byName['@retention'].type_id).to.equal('bigint')
    expect(byName['@continuous'].type_id).to.equal('bit')

    // system objects live in mssqlsystemresource and carry a negative object_id -
    // this is what excluded them from sys.objects / sys.parameters
    expect(byName['@job_type'].object_id).to.be.lessThan(0)
    expect(byName['@job_type'].proc_name).to.equal('sp_cdc_change_job')
    expect(byName['@job_type'].is_output).to.equal(false)
  })

  // the reported failure mode: get() bound only @returns, so call() rejected the args
  it('get sys.sp_cdc_change_job - bound meta exposes the input params', async function () {
    const proc = await getProc('sys.sp_cdc_change_job')
    const meta = proc.getMeta()
    const names = meta.params.map(p => p.name)

    expect(names).to.include('@job_type')
    expect(names).to.include('@retention')
    expect(meta.params.length).to.be.greaterThan(1)
    expect(meta.paramByName.job_type).to.not.equal(undefined)
    expect(meta.paramByName.retention).to.not.equal(undefined)
  })

  it('sys.sp_cdc_change_job - signature and select bind all params', async function () {
    const proc = await getProc('sys.sp_cdc_change_job')
    const meta = proc.getMeta()

    expect(meta.signature).to.contain('@job_type = ?')
    expect(meta.signature).to.contain('@retention = ?')
    expect(meta.select).to.contain('@job_type=?')
  })

  it('sys.sp_who - system proc callable end to end', async function () {
    const proc = await getProc('sys.sp_who')
    const names = proc.getMeta().params.map(p => p.name)
    expect(names).to.include('@loginame')

    const res = await proc.promises.call({})
    expect(res.first).to.be.an('array')
    expect(res.first.length).to.be.greaterThan(0)
    // sp_who reports at least the spid running this very query
    expect(res.first[0]).to.have.property('spid')
  })

  it('sys.sp_tables - system proc callable with a named input param', async function () {
    const proc = await getProc('sys.sp_tables')
    const names = proc.getMeta().params.map(p => p.name)
    expect(names).to.include('@table_name')
    expect(names).to.include('@table_owner')

    // pass a subset of the params by name, as the issue reporter did
    const res = await proc.promises.call({ table_name: '%' })
    expect(res.first).to.be.an('array')
    expect(res.first.length).to.be.greaterThan(0)
  })

  it('sys.sp_cdc_enable_db - zero/optional param system proc describes cleanly', async function () {
    // reported as "has no parameters and arguments were supplied" - it does in fact
    // carry one optional param, which was invisible before the fix
    const results = await describeProc('sys.sp_cdc_enable_db')
    const names = results.map(p => p.name)

    expect(names).to.include('@returns')
    expect(names).to.include('@fCreateCDCUserImplicit')
  })

  it('unqualified system proc name resolves via the sys schema', async function () {
    // sp_who with no schema prefix - mapFn defaults the schema to dbo, but
    // object_id() still resolves the sys.* system proc
    const results = await describeProc('sp_who')
    expect(results.map(p => p.name)).to.include('@loginame')
  })

  it('non existent proc still describes as empty', async function () {
    const results = await describeProc('sys.sp_this_does_not_exist_327')
    expect(results).to.be.an('array')
    expect(results.length).to.equal(0)
  })

  it('user proc still describes correctly - no regression from all_objects', async function () {
    const spName = 'test_sp_327_user_proc'
    const def = `alter procedure ${spName} @p1 int, @p2 varchar(50), @p3 int output as
begin
  set @p3 = @p1 * 2;
  select @p2 as echoed;
end`
    await env.promisedCreate(spName, def)

    const results = await describeProc(spName)
    const byName = results.reduce((agg, p) => { agg[p.name] = p; return agg }, {})

    expect(results.map(p => p.name)).to.deep.equal(['@returns', '@p1', '@p2', '@p3'])
    expect(byName['@p1'].type_id).to.equal('int')
    expect(byName['@p2'].type_id).to.equal('varchar')
    expect(byName['@p3'].is_output).to.equal(true)
    // user objects keep a positive object_id
    expect(byName['@p1'].object_id).to.be.greaterThan(0)

    const proc = await getProc(spName)
    const res = await proc.promises.call({ p1: 21, p2: 'hello' })
    expect(res.output[1]).to.equal(42)
  })
})
