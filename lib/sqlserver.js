// lib/sqlserver.js
'use strict';

const path = require('path');
const fs = require('fs');
const { createConnectionPromises } = require('./connection-promises');

/**
 * Find the appropriate native module based on environment and availability
 */
function loadNativeModule() {
    // Check for environment variable to override module selection
    const forcedBuild = process.env.SQLSERVER_BUILD;
    if (forcedBuild && (forcedBuild === 'Debug' || forcedBuild === 'Release')) {
        return require(`../build/${forcedBuild}/sqlserver`);
    }

    // Default paths to check
    const buildTypes = process.env.NODE_ENV === 'production' ? ['Release', 'Debug'] : ['Debug', 'Release'];

    for (const buildType of buildTypes) {
        const modulePath = path.join(__dirname, '..', 'build', buildType, 'sqlserver');
        try {
            // Check if the file exists before requiring
            const moduleName = 'sqlserver.node'
            const fullPath = path.join(modulePath, '..', moduleName);
            
            if (fs.existsSync(fullPath)) {
                return require(modulePath);
            }
        } catch (e) {
            // Silently continue to the next option
        }
    }

    // If we got here, no module was found
    throw new Error('Could not load the sqlserver native module. Make sure it is compiled properly.');
}

// Load the native module
const nativeModule = loadNativeModule();

/**
 * Wrapper for the Connection class
 */
class Connection {
    constructor() {
        this._native = new nativeModule.Connection();
        this._queue = [];
        this._busy = false;
        // Create the promise-based API
        this.promises = createConnectionPromises(this);
    }

    _executeNext() {
        if (this._queue.length === 0 || this._busy) {
            return;
        }

        this._busy = true;
        const task = this._queue[0];

        try {
            task.execute(() => {
                this._queue.shift(); // Remove the completed task
                this._busy = false;
                this._executeNext(); // Check for more tasks
            });
        } catch (err) {
            // Handle unexpected errors
            task.fail(err);
            this._queue.shift();
            this._busy = false;
            this._executeNext();
        }
    }

    _enqueue(task) {
        this._queue.push(task);
        this._executeNext();
        return task.promise; // If using promises
    }

    open(connectionString, callback) {
        return this._enqueue({
            execute: (done) => {
                this._native.open(connectionString, (err, conn) => {
                    if (callback) callback(err, conn);
                    done();
                });
            },
            fail: (err) => {
                if (callback) callback(err);
            }
        });
    }

    close(callback) { 
        return this._enqueue({
            execute: (done) => {
                this._native.close( (err, conn) => {
                    if (callback) callback(err, conn);
                    done();
                });
            },
            fail: (err) => {
                if (callback) callback(err);
            }
        });
    }

    query(sql, paramsOrCallback, callback) {
        let params, cb;
        if (typeof paramsOrCallback === 'function') {
            cb = paramsOrCallback;
            params = [];
        } else {
            cb = callback;
            params = paramsOrCallback || [];
        }

        const queryObj = {};

        return this._enqueue({
            execute: (done) => {
                const nativeQuery = this._native.query(sql, params, (err, rows, more) => {
                    if (cb) cb(err, rows, more);
                    if (!more) done();
                });

                // Store reference to the native query object
                queryObj.nativeQuery = nativeQuery;
            },
            fail: (err) => {
                if (cb) cb(err);
            }
        });

        // Return an object with methods that operate on the underlying native query
        return {
            on: (event, handler) => {
                if (queryObj.nativeQuery) {
                    queryObj.nativeQuery.on(event, handler);
                }
                return this;
            },
            cancelQuery: (cb) => {
                if (queryObj.nativeQuery) {
                    queryObj.nativeQuery.cancelQuery(cb);
                }
                return this;
            },
            // ... other query methods
        };
    }

    // Similar implementations for other methods
}

// Export the API
module.exports = {
    // Core functionality
    Connection,

    // Utility functions
    setLogLevel: nativeModule.setLogLevel,
    enableConsoleLogging: nativeModule.enableConsoleLogging,
    setLogFile: nativeModule.setLogFile,

    // Helper to get the native module directly if needed
    _native: nativeModule
};