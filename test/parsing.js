// ---------------------------------------------------------------------------------------------------------------------------------
// File: params.js
// Contents: test suite for parameters
//
// Copyright Microsoft Corporation and contributors
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
// --------------------------------------------------------------------------------------------------------------------------------
//

'use strict'

const chai = require('chai')
const expect = chai.expect
const utilModule = require('./../lib/util').utilModule

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('parsing', function () {
  this.timeout(60000)

  this.beforeEach(async function handler () {
    await env.open()
  })

  this.afterEach(async function handler () {
    await env.close()
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
