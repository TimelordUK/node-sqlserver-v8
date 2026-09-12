const utilModule = ((() => {
  const { QueryAggregator } = require('./query-aggregator')
  const { SchemaSplitter } = require('./shema-splitter')
  const cppDriver = (() => {
    // node-gyp-build resolves build/Release, then build/Debug, then the
    // bundled prebuilds/<platform>-<arch>/ binary. This project has always
    // preferred a local debug build over a release one, so try that first and
    // let node-gyp-build handle everything else.
    try {
      return require('../build/Debug/sqlserver.node')
    } catch (e) {
      return require('node-gyp-build')(require('path').join(__dirname, '..'))
    }
  })()
  const { logger } = require('./logger')

  // Initialize the logger with the native module
  logger.initialize(cppDriver)
  /*
  console.log(stripescape('[node].[dbo].[businessid]'))
  console.log(stripescape('[dbo].[businessid]'))
  console.log(stripescape('dbo.[businessid]'))
  console.log(stripescape('node.dbo.[businessid]'))
  console.log(stripescape('node.dbo.businessid'))
  console.log(stripescape('[age]'))
  console.log(stripescape('name'))

businessid
businessid
businessid
businessid
businessid
age
name
   */

  class Native {
    constructor () {
      this.cppDriver = cppDriver
    }
  }

  return {
    QueryAggregator,
    SchemaSplitter,
    Native
  }
})())

exports.utilModule = utilModule
