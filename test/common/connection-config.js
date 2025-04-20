// test/common/connection-config.js
'use strict'

const dotenv = require('dotenv')
const path = require('path')

// Load environment variables from .env file
dotenv.config()

class ConnectionConfig {
  constructor() {
    this.platform = process.platform
    this.connections = {}
    
    // Load connection strings from environment variables
    this._loadFromEnv()
  }

  _loadFromEnv() {
    // Look for environment variables using pattern CONNECTION_KEY, LOCAL17, etc.
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SQLSERVER_'))  {
        this.connections[key] = process.env[key]
      }
    })
  }

  getConnectionString() {
    // Get the default connection key from environment
    const key = process.env.CONNECTION_KEY || 'DEFAULT'
    
    // Get the connection string for this key
    let connectionString = this.connections[key]
    
    // If not found, use a sensible default based on platform
    if (!connectionString) {
      if (this.platform === 'win32') {
        return "Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;"
      } else {
        return "Driver={ODBC Driver 18 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#;TrustServerCertificate=yes;"
      }
    }
    
    // Add TrustServerCertificate for Linux if not specified
    if (this.platform !== 'win32' && 
        !connectionString.includes('TrustServerCertificate=') && 
        !connectionString.includes('Encrypt=no')) {
      connectionString += ";TrustServerCertificate=yes;"
    }
    
    return connectionString
  }
  
  // Get a specific connection string by key
  getConnectionByKey(key) {
    const connStr = this.connections[key]
    if (!connStr) {
      throw new Error(`Connection key "${key}" not found in configuration`)
    }
    
    let connectionString = connStr
    
    // Add TrustServerCertificate for Linux if needed
    if (this.platform !== 'win32' && 
        !connectionString.includes('TrustServerCertificate=') && 
        !connectionString.includes('Encrypt=no')) {
      connectionString += ";TrustServerCertificate=yes;"
    }
    
    return connectionString
  }
}

// Export singleton instance
module.exports = new ConnectionConfig()