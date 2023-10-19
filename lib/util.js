const utilModule = ((() => {
  const { QueryAggregator } = require('./query-aggregator')
  const { SchemaSplitter } = require('./shema-splitter')
  const cppDriver = require('../build/Release/sqlserverv8')
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
