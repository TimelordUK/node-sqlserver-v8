// src/connection-promises.ts
import { Connection } from './connection'

/**
 * Creates a promise-based API for the Connection class
 * @param connection The connection instance
 * @returns An object with promise-based methods
 */
export function createConnectionPromises (connection: Connection): any {
  return {
    /**
     * Open a connection to the database (Promise version)
     * @param connectionString Connection string
     * @returns Promise that resolves when connection is open
     */
    open: async (connectionString: string): Promise<Connection> => {
      return new Promise<Connection>((resolve, reject) => {
        connection.open(connectionString, (err, conn) => {
          if (err) {
            reject(err)
          } else {
            resolve(connection)
          }
        })
      })
    },

    /**
     * Close the database connection (Promise version)
     * @returns Promise that resolves when connection is closed
     */
    close: async (): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        connection.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },

    /**
     * Execute a SQL query (Promise version)
     * @param sql SQL query string
     * @param params Query parameters
     * @returns Promise that resolves with query results
     */
    query: async (sql: string, params: any[] = []): Promise<any[]> => {
      return new Promise<any[]>((resolve, reject) => {
        let results: any[] = []

        connection.query(sql, params, (err, rows, more) => {
          if (err) {
            reject(err)
            return
          }

          if (rows) {
            results = results.concat(rows)
          }

          if (!more) {
            resolve(results)
          }
        })
      })
    }

    // Additional promise-based methods would be added here
  }
}
