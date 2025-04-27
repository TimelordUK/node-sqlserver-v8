"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConnectionPromises = createConnectionPromises;
/**
 * Creates a promise-based API for the Connection class
 * @param connection The connection instance
 * @returns An object with promise-based methods
 */
function createConnectionPromises(connection) {
    return {
        /**
         * Open a connection to the database (Promise version)
         * @param connectionString Connection string
         * @returns Promise that resolves when connection is open
         */
        open: async (connectionString) => {
            return new Promise((resolve, reject) => {
                connection.open(connectionString, (err, conn) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(connection);
                    }
                });
            });
        },
        /**
         * Close the database connection (Promise version)
         * @returns Promise that resolves when connection is closed
         */
        close: async () => {
            return new Promise((resolve, reject) => {
                connection.close((err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        },
        /**
         * Execute a SQL query (Promise version)
         * @param sql SQL query string
         * @param params Query parameters
         * @returns Promise that resolves with query results
         */
        query: async (sql, params = []) => {
            return new Promise((resolve, reject) => {
                let results = [];
                connection.query(sql, params, (err, rows, more) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (rows) {
                        results = results.concat(rows);
                    }
                    if (!more) {
                        resolve(results);
                    }
                });
            });
        }
        // Additional promise-based methods would be added here
    };
}
//# sourceMappingURL=connection-promises.js.map