const utilModule = ((() => {
  const { QueryAggregator } = require('./query-aggregator')
  const { SchemaSplitter } = require('./shema-splitter')
  const cppDriver = (() => {
    try {
      return require('../build/Debug/sqlserver.node')
    } catch (e) {
      return require('../build/Release/sqlserver.node')
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
