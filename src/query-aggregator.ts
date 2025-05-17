import { EventEmitter } from 'events'
import { Connection } from './connection'
import { QueryResult, OdbcRow, StatementHandle } from './native-module'
import { QueryOptions, QueryReader } from './query-reader'
import logger from './logger'

export interface AggregatedResult {
  resultSets: {
    meta: QueryResult['meta']
    rows: OdbcRow[]
  }[]
  totalRows: number
  totalResultSets: number
}

export class QueryAggregator extends EventEmitter {
  private results: AggregatedResult = {
    resultSets: [],
    totalRows: 0,
    totalResultSets: 0
  }
  
  private currentResult: QueryResult
  private isComplete = false
  private statementHandle: StatementHandle
  private currentReader: QueryReader | null = null
  
  constructor (
    public readonly connection: Connection,
    initialResult: QueryResult,
    public readonly options?: QueryOptions
  ) {
    super()
    this.currentResult = initialResult
    this.statementHandle = initialResult.handle
    
    // Start processing automatically
    this.processResults().catch(err => {
      this.emit('error', err)
    })
  }
  
  private async processResults(): Promise<void> {
    logger.debug(`QueryAggregator: Starting to process results for statement ${this.statementHandle.statementId}`)
    
    try {
      let hasMoreResults = true
      let resultSetIndex = 0
      
      while (hasMoreResults) {
        // Process current result set
        await this.processResultSet(this.currentResult, resultSetIndex)
        
        // Check if there are more result sets
        if (!this.currentResult.endOfResults) {
          const nextResult = await this.connection.promises.nextResultSet(this.statementHandle, 50)
          
          if (nextResult && !nextResult.endOfResults) {
            this.currentResult = nextResult
            resultSetIndex++
          } else {
            hasMoreResults = false
          }
        } else {
          hasMoreResults = false
        }
      }
      
      this.isComplete = true
      
      // Emit completion event with aggregated results
      this.emit('complete', this.results)
      
      // Clean up resources
      await this.cleanup()
      
    } catch (error) {
      logger.error(`QueryAggregator error: ${error}`)
      this.emit('error', error)
      
      // Still try to clean up on error
      await this.cleanup().catch(cleanupError => {
        logger.error(`Error during cleanup: ${cleanupError}`)
      })
    }
  }
  
  private async processResultSet(result: QueryResult, index: number): Promise<void> {
    logger.debug(`Processing result set ${index} for statement ${this.statementHandle.statementId}`)
    
    // Use the same options but force non-streaming for aggregation
    const aggregateOptions = { ...this.options, streaming: false }
    
    // Create a reader for this result set
    this.currentReader = new QueryReader(this.connection, result, aggregateOptions)
    
    try {
      // Get all rows for this result set
      const rows = await this.currentReader.getAllRows()
      
      // Add to aggregated results
      this.results.resultSets.push({
        meta: result.meta,
        rows
      })
      
      this.results.totalRows += rows.length
      this.results.totalResultSets++
      
      // Emit progress event
      this.emit('resultSet', {
        index,
        meta: result.meta,
        rowCount: rows.length,
        rows: this.options?.streaming ? undefined : rows
      })
      
    } finally {
      // Clear the current reader reference
      this.currentReader = null
    }
  }
  
  private async cleanup(): Promise<void> {
    logger.debug(`QueryAggregator: Cleaning up statement ${this.statementHandle.statementId}`)
    
    try {
      // Tell the connection to release the statement
      await this.releaseStatement()
      logger.debug(`QueryAggregator: Successfully released statement ${this.statementHandle.statementId}`)
    } catch (error) {
      logger.error(`QueryAggregator: Error releasing statement ${this.statementHandle.statementId}: ${error}`)
      throw error
    }
  }
  
  private async releaseStatement(): Promise<void> {
    // Release the statement handle on the connection
    await this.connection.promises.releaseStatement(this.statementHandle)
    
    // Also emit an event for any listeners
    this.emit('statementComplete', this.statementHandle)
  }
  
  async getResults(): Promise<AggregatedResult> {
    if (this.isComplete) {
      return this.results
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('complete', onComplete)
        this.removeListener('error', onError)
        reject(new Error('Timeout waiting for query aggregation to complete'))
      }, 60000) // 60 second timeout for complex queries
      
      const onComplete = (results: AggregatedResult) => {
        clearTimeout(timeout)
        this.removeListener('error', onError)
        resolve(results)
      }
      
      const onError = (err: Error) => {
        clearTimeout(timeout)
        this.removeListener('complete', onComplete)
        reject(err)
      }
      
      this.once('complete', onComplete)
      this.once('error', onError)
    })
  }
  
  /**
   * Get current progress of the aggregation
   */
  getProgress(): {
    totalResultSets: number
    totalRows: number
    isComplete: boolean
  } {
    return {
      totalResultSets: this.results.totalResultSets,
      totalRows: this.results.totalRows,
      isComplete: this.isComplete
    }
  }
}