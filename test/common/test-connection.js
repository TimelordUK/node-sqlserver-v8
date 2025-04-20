// test/common/test-connection.js
'use strict'

const sql = require('../../msnodesqlv8')  // Your driver module
const connectionConfig = require('./connection-config')

/**
 * Create a test connection
 * 
 * @param {Function} callback Optional callback function
 * @returns {Promise|void} Returns Promise if no callback is provided
 */
function createConnection(callback) {
  const connection = new sql.Connection()
  
  if (typeof callback === 'function') {
    connection.open(connectionConfig.getConnectionString(), (err, conn) => {
      callback(err, connection)
    })
    return
  }
  
  // Return promise if no callback
  return new Promise((resolve, reject) => {
    connection.open(connectionConfig.getConnectionString(), (err, conn) => {
      if (err) return reject(err)
      resolve(conn)
    })
  })
}

module.exports = {
  createConnection,
  getConnectionString: connectionConfig.getConnectionString.bind(connectionConfig),
  connectionConfig
}