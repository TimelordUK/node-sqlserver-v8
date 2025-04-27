"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// test/common/connection-config.ts
var dotenv = require("dotenv");
// Load environment variables from .env file
dotenv.config();
/**
 * Class to manage SQL Server connection configurations
 */
var ConnectionConfig = /** @class */ (function () {
    function ConnectionConfig() {
        this.platform = process.platform;
        this.connections = {};
        // Load connection strings from environment variables
        this._loadFromEnv();
    }
    /**
     * Load connection strings from environment variables
     * @private
     */
    ConnectionConfig.prototype._loadFromEnv = function () {
        var _this = this;
        // Look for environment variables using pattern SQLSERVER_*
        Object.keys(process.env).forEach(function (key) {
            if (key.startsWith('SQLSERVER_')) {
                var value = process.env[key];
                if (value) {
                    _this.connections[key] = value;
                }
            }
        });
    };
    /**
     * Get the default connection string
     * @returns Connection string for SQL Server
     */
    ConnectionConfig.prototype.getConnectionString = function () {
        // Get the default connection key from environment
        var key = process.env.CONNECTION_KEY || 'DEFAULT';
        // Get the connection string for this key
        var connectionString = this.connections[key];
        // If not found, use a sensible default based on platform
        if (!connectionString) {
            if (this.platform === 'win32') {
                return "Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;";
            }
            else {
                return "Driver={ODBC Driver 18 for SQL Server};Server=localhost,1433;Database=node;UID=admin;PWD=Password_123#;TrustServerCertificate=yes;";
            }
        }
        // Add TrustServerCertificate for Linux if not specified
        return this.addTrustServerCertificateIfNeeded(connectionString);
    };
    /**
     * Get a specific connection string by key
     * @param key Connection key (e.g., SQLSERVER_DEV18)
     * @returns Connection string for the specified key
     * @throws Error if connection key is not found
     */
    ConnectionConfig.prototype.getConnectionByKey = function (key) {
        var connStr = this.connections[key];
        if (!connStr) {
            throw new Error("Connection key \"".concat(key, "\" not found in configuration"));
        }
        // Add TrustServerCertificate for Linux if needed
        return this.addTrustServerCertificateIfNeeded(connStr);
    };
    /**
     * Add TrustServerCertificate option for non-Windows platforms if needed
     * @param connectionString Original connection string
     * @returns Modified connection string
     * @private
     */
    ConnectionConfig.prototype.addTrustServerCertificateIfNeeded = function (connectionString) {
        if (this.platform !== 'win32' &&
            !connectionString.includes('TrustServerCertificate=') &&
            !connectionString.includes('Encrypt=no')) {
            return "".concat(connectionString, ";TrustServerCertificate=yes;");
        }
        return connectionString;
    };
    /**
     * Get all available connection keys
     * @returns Array of connection keys
     */
    ConnectionConfig.prototype.getAvailableConnectionKeys = function () {
        return Object.keys(this.connections);
    };
    /**
     * Check if a connection key exists
     * @param key Connection key to check
     * @returns True if the connection key exists
     */
    ConnectionConfig.prototype.hasConnectionKey = function (key) {
        return Object.prototype.hasOwnProperty.call(this.connections, key);
    };
    return ConnectionConfig;
}());
// Export singleton instance
exports.default = new ConnectionConfig();
