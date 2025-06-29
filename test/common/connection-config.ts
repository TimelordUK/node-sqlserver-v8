// test/common/connection-config.ts
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env file
dotenv.config()

/**
 * Type for the connections dictionary
 */
type ConnectionDictionary = Record<string, string>

/**
 * Class to manage SQL Server connection configurations
 */
class ConnectionConfig {
  platform: string
  connections: ConnectionDictionary

  constructor () {
    this.platform = process.platform
    this.connections = {}

    // Load connection strings from environment variables
    this._loadFromEnv()
  }

  /**
   * Load connection strings from environment variables
   * @private
   */
  private _loadFromEnv (): void {
    // Look for environment variables using pattern SQLSERVER_*
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SQLSERVER_')) {
        const value = process.env[key]
        if (value) {
          this.connections[key] = value
        }
      }
    })
  }

  /**
   * Get the default connection string
   * @returns Connection string for SQL Server
   */
  getConnectionString (): string {
    // Get the default connection key from environment
    const key = process.env.CONNECTION_KEY || 'DEFAULT'

    // Get the connection string for this key
    const connectionString = this.connections[key]

    // If not found, use a sensible default based on platform
    if (!connectionString) {
      if (this.platform === 'win32') {
        return 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'
      } else {
        return 'Driver={ODBC Driver 18 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#;TrustServerCertificate=yes;'
      }
    }

    // Add TrustServerCertificate for Linux if not specified
    return this.addTrustServerCertificateIfNeeded(connectionString)
  }

  /**
   * Get a specific connection string by key
   * @param key Connection key (e.g., SQLSERVER_DEV18)
   * @returns Connection string for the specified key
   * @throws Error if connection key is not found
   */
  getConnectionByKey (key: string): string {
    const connStr = this.connections[key]
    if (!connStr) {
      throw new Error(`Connection key "${key}" not found in configuration`)
    }

    // Add TrustServerCertificate for Linux if needed
    return this.addTrustServerCertificateIfNeeded(connStr)
  }

  /**
   * Add TrustServerCertificate option for non-Windows platforms if needed
   * @param connectionString Original connection string
   * @returns Modified connection string
   * @private
   */
  private addTrustServerCertificateIfNeeded (connectionString: string): string {
    if (this.platform !== 'win32' &&
      !connectionString.includes('TrustServerCertificate=') &&
      !connectionString.includes('Encrypt=no')) {
      return `${connectionString};TrustServerCertificate=yes;`
    }
    return connectionString
  }

  /**
   * Get all available connection keys
   * @returns Array of connection keys
   */
  getAvailableConnectionKeys (): string[] {
    return Object.keys(this.connections)
  }

  /**
   * Check if a connection key exists
   * @param key Connection key to check
   * @returns True if the connection key exists
   */
  hasConnectionKey (key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.connections, key)
  }
}

// Export singleton instance
export default new ConnectionConfig()
