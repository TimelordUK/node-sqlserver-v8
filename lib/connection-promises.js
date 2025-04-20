// lib/connection-promises.js
'use strict';

/**
 * Create Promise-based APIs for Connection methods
 * @param {Connection} connection The connection object to wrap
 * @returns {Object} Promise-based API methods
 */
function createConnectionPromises(connection) {
    return {
        /**
         * Open a connection to SQL Server
         * @param {string} connectionString ODBC connection string
         * @returns {Promise<Connection>} Promise that resolves with the connection
         */
        open(connectionString) {
            return new Promise((resolve, reject) => {
                connection.open(connectionString, (err, conn) => {
                    if (err) return reject(err);
                    resolve(conn);
                });
            });
        },

        /**
         * Close the active connection
         * @returns {Promise<void>} Promise that resolves when connection is closed
         */
        close() {
            return new Promise((resolve, reject) => {
                connection.close((err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        },

        // Other methods would be added here (beginTransaction, commit, rollback, etc.)
    };
}

module.exports = { createConnectionPromises };