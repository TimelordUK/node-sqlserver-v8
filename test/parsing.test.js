'use strict'

const chai = require('chai')
const expect = chai.expect
const utilModule = require('./../lib/util').utilModule

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('parsing', function () {
  this.timeout(60000)

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

  it('check decomposition of table name MyTable', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('MyTable')
    const expected = {
      qualifiedName: 'MyTable',
      fullTableName: 'MyTable',
      cat: '',
      schema: '',
      table: 'MyTable'
    }
    expect(decom).to.deep.equal(expected)
  })

  it('check decomposition of table name [MyTable]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('[MyTable]')
    const expected = {
      qualifiedName: '[MyTable]',
      fullTableName: '[MyTable]',
      cat: '',
      schema: '',
      table: '[MyTable]'
    }
    expect(decom).to.deep.equal(expected)
  })

  it('check decomposition of table name [dbo].[MyTable]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('[dbo].[MyTable]')
    const expected = {
      qualifiedName: '[dbo].[MyTable]',
      fullTableName: '[MyTable]',
      cat: '',
      schema: '[dbo]',
      table: '[MyTable]'
    }
    expect(decom).to.deep.equal(expected)
  })

  it('check decomposition of table name [node].[dbo].[MyTable]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('[node].[dbo].[MyTable]')
    const expected = {
      qualifiedName: '[node].[dbo].[MyTable]',
      fullTableName: '[MyTable]',
      cat: '[node]',
      schema: '[dbo]',
      table: '[MyTable]'
    }
    expect(decom).to.deep.equal(expected)
  })

  it('check strip decomposition of table name [node].[dbo].[MyTable]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('[node].[dbo].[MyTable]')
    const strip = splitter.strip(decom.table)
    expect(strip).to.deep.equal('MyTable')
  })

  it('check strip decomposition of cat name [node].[dbo].[MyTable]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.decomposeSchema('[node].[dbo].[MyTable]')
    const strip = splitter.strip(decom.cat)
    expect(strip).to.deep.equal('node')
  })

  it('get column [node].[dbo].[MyColumn]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('[node].[dbo].[MyColumn]')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column [dbo].[MyColumn]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('[dbo].[MyColumn]')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column [MyColumn]', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('[MyColumn]')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column MyColumn', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('MyColumn')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column node.dbo.MyColumn', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('node.dbo.MyColumn')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column dbo.MyColumn', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('dbo.MyColumn')
    expect(decom).to.deep.equal('MyColumn')
  })

  it('get column MyColumn', function handler () {
    const splitter = new utilModule.SchemaSplitter()
    const decom = splitter.stripEscape('MyColumn')
    expect(decom).to.deep.equal('MyColumn')
  })
})
