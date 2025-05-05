// This file contains example usage patterns for the Statement class
// It is not part of the actual codebase but provides guidance for users.

import { Connection } from './connection'
import { Statement } from './statement'

// Mock Connection for the example
const mockConnection = {} as Connection

/**
 * Example: Modern Promise-based pattern for executing a query
 */
async function modernQueryExample () {
  // Assuming we have a connection and we've created a statement
  const statement = new Statement(mockConnection, 1, -1) // actual statementId is set during execute

  try {
    // Execute the query and get the initial metadata and rows
    const { metadata, rows } = await statement.execute(
      'SELECT id, name, email FROM users WHERE status = ?',
      ['active']
    )

    console.log('Metadata:', metadata)
    console.log('First batch of rows:', rows)

    // Check if there are more rows to fetch
    if (statement.hasMoreRows()) {
      // Fetch the next batch of rows
      const { rows: nextRows, hasMore } = await statement.fetchBatch()
      console.log('Second batch of rows:', nextRows)

      // Continue fetching batches until no more rows
      let batchNumber = 3
      while (hasMore) {
        const { rows: batchRows, hasMore: moreBatches } = await statement.fetchBatch()
        console.log(`Batch ${batchNumber} of rows:`, batchRows)
        batchNumber++

        if (!moreBatches) break
      }
    }

    // Check for more result sets
    const { hasMore, metadata: nextMetadata } = await statement.checkMoreResults()
    if (hasMore && nextMetadata) {
      console.log('Next result set metadata:', nextMetadata)

      // Fetch rows from the next result set
      const { rows: nextResultRows } = await statement.fetchBatch()
      console.log('Rows from next result set:', nextResultRows)
    }

    // If needed, you can cancel the statement
    // await statement.cancel();
  } catch (error) {
    console.error('Error executing query:', error)
  }
}

/**
 * Example: Legacy callback-based pattern for executing a query
 */
function legacyQueryExample () {
  // Assuming we have a connection and we've created a statement
  const statement = new Statement(mockConnection, 1, -1)

  // Execute the query
  statement.execute(
    'SELECT id, name, email FROM users WHERE status = ?',
    ['active'],
    (err, rows, hasMore) => {
      if (err) {
        console.error('Error executing query:', err)
        return
      }

      console.log('Rows:', rows)

      if (hasMore) {
        // Fetch more rows
        statement.fetchBatch((err, nextRows, hasMoreRows) => {
          if (err) {
            console.error('Error fetching more rows:', err)
            return
          }

          console.log('More rows:', nextRows)

          // Additional fetching could be done here in the same pattern
        })
      }
    }
  )
}

/**
 * Example: Mixed approach using events
 */
function eventBasedExample () {
  // Assuming we have a connection and we've created a statement
  const statement = new Statement(mockConnection, 1, -1)

  // Set up event handlers
  statement.on('metadata', (metadata) => {
    console.log('Received metadata:', metadata)
  })

  statement.on('row', (row) => {
    console.log('Received row:', row)
  })

  statement.on('batch', (rows) => {
    console.log('Received batch of rows:', rows)
  })

  statement.on('done', () => {
    console.log('Query execution completed')
  })

  statement.on('error', (error) => {
    console.error('Error in statement:', error)
  })

  statement.on('canceled', () => {
    console.log('Statement was canceled')
  })

  // Execute the query using promises for control flow
  async function executeWithEvents () {
    try {
      await statement.execute('SELECT * FROM users')

      // Events will fire during execution, but we can also use the Promise
      // to know when everything is complete
      console.log('Initial execution complete')

      // Could fetch more batches if needed
      while (statement.hasMoreRows()) {
        const { hasMore } = await statement.fetchBatch()
        if (!hasMore) break
      }

      console.log('All rows fetched')
    } catch (error) {
      console.error('Error in execution:', error)
    }
  }

  executeWithEvents()
}

/**
 * Example: Setting batch size
 */
function batchSizeExample () {
  const statement = new Statement(mockConnection, 1, -1)

  // Set a custom batch size before executing
  statement.setBatchSize(100)

  // Now execute with a larger batch size
  statement.execute('SELECT * FROM large_table')
    .then(({ rows }) => {
      console.log(`Retrieved ${rows.length} rows in first batch`)
    })
    .catch(err => {
      console.error('Error:', err)
    })
}

/**
 * Example: Complex query with multiple result sets
 */
async function multipleResultSetsExample () {
  const statement = new Statement(mockConnection, 1, -1)

  try {
    // Execute a batch that returns multiple result sets
    const { metadata, rows } = await statement.execute(`
      SELECT id, name FROM users;
      SELECT product_id, name FROM products;
      SELECT order_id, customer_id FROM orders;
    `)

    // Process first result set
    console.log('First result set metadata:', metadata)
    console.log('First result set rows:', rows)

    // Check for and process each additional result set
    let resultSetNumber = 2
    let hasMoreResults = true

    while (hasMoreResults) {
      const { hasMore, metadata: nextMetadata } = await statement.checkMoreResults()

      if (!hasMore) {
        hasMoreResults = false
        break
      }

      console.log(`Result set ${resultSetNumber} metadata:`, nextMetadata)

      // Fetch rows for this result set
      const { rows: resultSetRows } = await statement.fetchBatch()
      console.log(`Result set ${resultSetNumber} rows:`, resultSetRows)

      resultSetNumber++
    }

    console.log('All result sets processed')
  } catch (error) {
    console.error('Error processing multiple result sets:', error)
  }
}
