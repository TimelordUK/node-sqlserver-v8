"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// test/common/connection-config.ts
const dotenv = __importStar(require("dotenv"));
// Load environment variables from .env file
dotenv.config();
/**
 * Class to manage SQL Server connection configurations
 */
class ConnectionConfig {
    constructor() {
        this.platform = process.platform;
        this.connections = {};
        // Load connection strings from environment variables
        this._loadFromEnv();
    }
    /**
     * Load connection strings from environment variables
     * @private
     */
    _loadFromEnv() {
        // Look for environment variables using pattern SQLSERVER_*
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('SQLSERVER_')) {
                const value = process.env[key];
                if (value) {
                    this.connections[key] = value;
                }
            }
        });
    }
    /**
     * Get the default connection string
     * @returns Connection string for SQL Server
     */
    getConnectionString() {
        // Get the default connection key from environment
        const key = process.env.CONNECTION_KEY || 'DEFAULT';
        // Get the connection string for this key
        let connectionString = this.connections[key];
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
    }
    /**
     * Get a specific connection string by key
     * @param key Connection key (e.g., SQLSERVER_DEV18)
     * @returns Connection string for the specified key
     * @throws Error if connection key is not found
     */
    getConnectionByKey(key) {
        const connStr = this.connections[key];
        if (!connStr) {
            throw new Error(`Connection key "${key}" not found in configuration`);
        }
        // Add TrustServerCertificate for Linux if needed
        return this.addTrustServerCertificateIfNeeded(connStr);
    }
    /**
     * Add TrustServerCertificate option for non-Windows platforms if needed
     * @param connectionString Original connection string
     * @returns Modified connection string
     * @private
     */
    addTrustServerCertificateIfNeeded(connectionString) {
        if (this.platform !== 'win32' &&
            !connectionString.includes('TrustServerCertificate=') &&
            !connectionString.includes('Encrypt=no')) {
            return `${connectionString};TrustServerCertificate=yes;`;
        }
        return connectionString;
    }
    /**
     * Get all available connection keys
     * @returns Array of connection keys
     */
    getAvailableConnectionKeys() {
        return Object.keys(this.connections);
    }
    /**
     * Check if a connection key exists
     * @param key Connection key to check
     * @returns True if the connection key exists
     */
    hasConnectionKey(key) {
        return Object.prototype.hasOwnProperty.call(this.connections, key);
    }
}
// Export singleton instance
exports.default = new ConnectionConfig();
//# sourceMappingURL=connection-config.js.map