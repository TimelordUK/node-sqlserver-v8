"use strict";
// src/sql-parameter.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlParameter = void 0;
exports.fromValue = fromValue;
/**
 * Represents a SQL parameter with type information and options
 */
class SqlParameter {
    /**
     * Create a new SQL parameter
     * @param name Parameter name or identifier
     * @param type SQL type name or identifier
     * @param value Parameter value
     * @param options Additional parameter options
     */
    constructor(name, type, value, options = {}) {
        this.name = name;
        this.type = type;
        this.value = value;
        this.options = options;
    }
    /**
     * Create a parameter from a value, inferring the type
     * @param value The parameter value
     * @param options Additional parameter options
     * @returns A new SqlParameter instance
     */
    static fromValue(value, options = {}) {
        // Determine SQL type from JS value type
        let type;
        if (value === null || value === undefined) {
            type = 'NULL';
        }
        else if (typeof value === 'string') {
            type = 'NVARCHAR';
        }
        else if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'INT' : 'FLOAT';
        }
        else if (value instanceof Date) {
            type = 'DATETIME';
        }
        else if (value instanceof Buffer) {
            type = 'VARBINARY';
        }
        else if (typeof value === 'boolean') {
            type = 'BIT';
        }
        else {
            // Default for objects and other types
            type = 'NVARCHAR';
        }
        return new SqlParameter('', type, value, options);
    }
}
exports.SqlParameter = SqlParameter;
/**
 * Helper function to create a parameter from a value
 * @param value The parameter value
 * @param options Additional parameter options
 * @returns A new SqlParameter instance
 */
function fromValue(value, options = {}) {
    return SqlParameter.fromValue(value, options);
}
//# sourceMappingURL=sql-parameter.js.map