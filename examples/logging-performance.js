'use strict'

const sql = require('../lib/sql')

// Example showing performance-conscious logging

// Method 1: Standard logging (string is always evaluated)
// AVOID THIS for expensive string operations in hot paths:
function exampleWithStringInterpolation (id, data) {
  // This concatenates strings even when logging is disabled!
  sql.logger.trace(`Processing ${data.length} items for ID ${id}`)
  
  // Process data...
}

// Method 2: Early exit check (better)
// Use this when you have simple string interpolation:
function exampleWithEarlyExit (id, data) {
  // The logger methods now check isEnabled() first, but string is still built
  sql.logger.trace(`Processing ${data.length} items for ID ${id}`)
  
  // Process data...
}

// Method 3: Lazy evaluation (best for expensive operations)
// Use this for complex string building or when in hot code paths:
function exampleWithLazyEvaluation (id, data) {
  // The function is only called if TRACE level is enabled
  sql.logger.traceLazy(() => `Processing ${data.length} items for ID ${id}`)
  
  // For very expensive operations:
  sql.logger.debugLazy(() => {
    // This expensive operation only runs if DEBUG is enabled
    const summary = data.map(item => item.toString()).join(', ')
    return `Data summary: ${summary}`
  })
  
  // Process data...
}

// Performance comparison
console.log('Running performance test with logging disabled (SILENT mode)...')
sql.logger.setLogLevel(sql.LogLevel.SILENT)

const testData = Array(1000).fill({ id: 1, value: 'test' })
const iterations = 10000

console.time('String interpolation (always evaluated)')
for (let i = 0; i < iterations; i++) {
  exampleWithStringInterpolation(i, testData)
}
console.timeEnd('String interpolation (always evaluated)')

console.time('Lazy evaluation (function not called)')
for (let i = 0; i < iterations; i++) {
  exampleWithLazyEvaluation(i, testData)
}
console.timeEnd('Lazy evaluation (function not called)')

console.log('\nNow with logging enabled (TRACE mode)...')
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(false) // Disable console to focus on string building

console.time('String interpolation (with logging)')
for (let i = 0; i < 100; i++) { // Fewer iterations when logging
  exampleWithStringInterpolation(i, testData)
}
console.timeEnd('String interpolation (with logging)')

console.time('Lazy evaluation (with logging)')
for (let i = 0; i < 100; i++) {
  exampleWithLazyEvaluation(i, testData)
}
console.timeEnd('Lazy evaluation (with logging)')