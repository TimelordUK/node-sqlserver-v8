"use strict";
// src/sql-parameter.ts
// TypeScript will recognize BufferEncoding from @types/node
Object.defineProperty(exports, "__esModule", { value: true });
exports.TVPParameter = exports.DateTimeArrayParameter = exports.BooleanArrayParameter = exports.FloatArrayParameter = exports.IntegerArrayParameter = exports.StringArrayParameter = exports.ArrayParameter = exports.ObjectParameter = exports.DateTimeParameter = exports.BooleanParameter = exports.FloatParameter = exports.IntegerParameter = exports.StringParameter = exports.NullParameter = exports.SqlParameter = void 0;
exports.fromValue = fromValue;
/**
 * Base SQL parameter class
 */
class SqlParameter {
    /**
     * Create a SQL parameter
     * @param options Parameter options
     */
    constructor(options = {}) {
        // Common properties for all parameter types
        this.type = null; // Generic type category
        this.sqlType = null; // SQL type (e.g., 'SQL_WVARCHAR')
        this.jsType = null; // JS type representation
        this.cType = null; // C type for binding
        this.precision = 0; // Type precision
        this.scale = 0; // Type scale (for numeric types)
        this.value = null; // Original JS value
        this.paramSize = 0; // Size parameter for binding
        this.bufferLen = 0; // Buffer length for binding
        this.encoding = options.encoding || 'ucs2';
        // Apply any provided options
        Object.assign(this, options);
    }
    /**
     * Get string representation of parameter
     */
    toString() {
        const valuePreview = this.formatValuePreview();
        return `SqlParameter(type=${this.type}, sqlType=${this.sqlType}, jsType = ${this.jsType} value=${valuePreview})`;
    }
    /**
     * Format a preview of the parameter value
     */
    formatValuePreview() {
        if (this.value === null || this.value === undefined)
            return 'null';
        if (typeof this.value === 'string') {
            // Truncate long strings
            return this.value.length > 20
                ? `"${this.value.substring(0, 17)}..."`
                : `"${this.value}"`;
        }
        if (Array.isArray(this.value)) {
            return `[Array(${this.value.length})]`;
        }
        if (this.value instanceof Date) {
            return `Date(${this.value.toISOString()})`;
        }
        return String(this.value);
    }
    /**
     * Factory method to create the right parameter type
     * @param value Parameter value
     * @param options Parameter options
     */
    static fromValue(value, options = {}) {
        if (value === null || value === undefined) {
            return new NullParameter();
        }
        if (typeof value !== 'object' || value instanceof Date) {
            return SqlParameter.fromScalarValue(value, options);
        }
        if (Array.isArray(value)) {
            return SqlParameter.fromArrayValue(value, options);
        }
        // Handle TVP - special case for Table-Valued Parameters
        if (typeof value === 'object' &&
            'name' in value &&
            'columns' in value &&
            'rows' in value) {
            return new TVPParameter(value, options);
        }
        // Handle objects - may already be a parameter specification
        if (typeof value === 'object' &&
            value !== null &&
            'type' in value &&
            'value' in value &&
            typeof value.type === 'string') {
            // Use a type guard to ensure we have a BindingSpecification
            const bindingObj = value;
            return SqlParameter.normalizeBindingObject(bindingObj, options);
        }
        // Default - treat as generic object
        return new ObjectParameter(value, options);
    }
    /**
     * Create parameter from scalar value
     * @param value Scalar value
     * @param options Parameter options
     */
    static fromScalarValue(value, options) {
        if (typeof value === 'string') {
            return new StringParameter(value, options);
        }
        if (typeof value === 'number') {
            return Number.isInteger(value)
                ? new IntegerParameter(value, options)
                : new FloatParameter(value, options);
        }
        if (typeof value === 'boolean') {
            return new BooleanParameter(value, options);
        }
        if (value instanceof Date) {
            return new DateTimeParameter(value, options);
        }
        // Default case - convert to string (handles undefined/null with default behavior)
        return new StringParameter(String(value), options);
    }
    /**
     * Create parameter from array value
     * @param array Array value
     * @param options Parameter options
     */
    static fromArrayValue(array, options) {
        if (array.length === 0) {
            return new ArrayParameter(array, 'UNKNOWN', options);
        }
        // Infer element type from first non-null element
        const firstNonNull = array.find(item => item !== null && item !== undefined);
        if (!firstNonNull) {
            // All nulls, default to string array
            return new ArrayParameter(array, 'STRING', options);
        }
        // Create appropriate array parameter based on element type
        if (typeof firstNonNull === 'string') {
            return new StringArrayParameter(array, options);
        }
        if (typeof firstNonNull === 'number') {
            return Number.isInteger(firstNonNull)
                ? new IntegerArrayParameter(array, options)
                : new FloatArrayParameter(array, options);
        }
        if (typeof firstNonNull === 'boolean') {
            return new BooleanArrayParameter(array, options);
        }
        if (firstNonNull instanceof Date) {
            return new DateTimeArrayParameter(array, options);
        }
        // Default - convert all to strings
        return new StringArrayParameter(array.map(item => item === null || item === undefined ? null : String(item)), options);
    }
    /**
     * Normalize a binding object
     * @param spec Parameter specification
     * @param options Parameter options
     */
    static normalizeBindingObject(spec, options) {
        var _a;
        // Create appropriate parameter type based on the spec
        const type = spec.type.toUpperCase();
        const elementType = ((_a = spec.elementType) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || '';
        const arrayValue = spec.value;
        switch (type) {
            case 'STRING':
                return new StringParameter(spec.value, { ...options, ...spec });
            case 'INTEGER':
                return new IntegerParameter(spec.value, { ...options, ...spec });
            case 'FLOAT':
                return new FloatParameter(spec.value, { ...options, ...spec });
            case 'BIT':
            case 'BOOLEAN':
                return new BooleanParameter(spec.value, { ...options, ...spec });
            case 'DATETIME':
                return new DateTimeParameter(spec.value, { ...options, ...spec });
            case 'ARRAY':
                // Handle array types based on elementType
                switch (elementType) {
                    case 'STRING':
                        return new StringArrayParameter(arrayValue, { ...options, ...spec });
                    case 'INTEGER':
                        return new IntegerArrayParameter(arrayValue, { ...options, ...spec });
                    case 'FLOAT':
                        return new FloatArrayParameter(arrayValue, { ...options, ...spec });
                    case 'BIT':
                    case 'BOOLEAN':
                        return new BooleanArrayParameter(arrayValue, { ...options, ...spec });
                    case 'DATETIME':
                        return new DateTimeArrayParameter(arrayValue, { ...options, ...spec });
                    default:
                        return new ArrayParameter(arrayValue, elementType, { ...options, ...spec });
                }
            default:
                // For custom types, create generic parameter
                return new SqlParameter({ ...spec, ...options });
        }
    }
}
exports.SqlParameter = SqlParameter;
/**
 * Parameter for null values
 */
class NullParameter extends SqlParameter {
    constructor(options = {}) {
        super(options);
        this.type = 'NULL';
        this.sqlType = 'SQL_NULL_DATA';
        this.jsType = 'JS_NULL';
        this.value = null;
    }
}
exports.NullParameter = NullParameter;
/**
 * Parameter for string values
 */
class StringParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        const strValue = value === null || value === undefined ? '' : String(value);
        this.type = 'STRING';
        this.jsType = 'JS_STRING';
        this.value = strValue;
        this.cType = 'SQL_C_WCHAR';
        // Calculate string properties
        const charLength = strValue.length;
        const byteLength = Buffer.byteLength(strValue, this.encoding);
        // Set SQL type based on length
        if (charLength > 2000 && charLength < 4000) {
            this.sqlType = 'SQL_WLONGVARCHAR';
        }
        else {
            this.sqlType = 'SQL_WVARCHAR';
        }
        // For very large strings, use 0 for paramSize
        this.precision = charLength;
        this.paramSize = charLength >= 4000 ? 0 : charLength;
        this.bufferLen = byteLength + 2; // +2 for null terminator
        // Pre-encode for C++ convenience
        this.bytes = Buffer.from(strValue, this.encoding);
    }
}
exports.StringParameter = StringParameter;
/**
 * Parameter for integer values
 */
class IntegerParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        this.type = 'INTEGER';
        this.jsType = 'JS_NUMBER';
        this.value = Number(value);
        this.cType = 'SQL_C_SBIGINT';
        // Determine size based on value range
        if (this.value >= -128 && this.value <= 127) {
            this.sqlType = 'SQL_TINYINT';
            this.precision = 1;
        }
        else if (this.value >= -32768 && this.value <= 32767) {
            this.sqlType = 'SQL_SMALLINT';
            this.precision = 2;
        }
        else if (this.value >= -2147483648 && this.value <= 2147483647) {
            this.sqlType = 'SQL_INTEGER';
            this.precision = 4;
        }
        else {
            this.sqlType = 'SQL_BIGINT';
            this.precision = 8;
        }
        this.paramSize = this.precision;
        this.bufferLen = this.precision;
    }
}
exports.IntegerParameter = IntegerParameter;
/**
 * Parameter for floating point values
 */
class FloatParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        this.type = 'FLOAT';
        this.jsType = 'JS_NUMBER';
        this.value = Number(value);
        // Determine precision
        const absValue = Math.abs(this.value);
        if (absValue > 3.4e38 || (absValue < 1.2e-38 && absValue !== 0)) {
            this.sqlType = 'SQL_DOUBLE';
            this.cType = 'SQL_C_DOUBLE';
            this.precision = 8;
        }
        else {
            this.sqlType = 'SQL_REAL';
            this.cType = 'SQL_C_FLOAT';
            this.precision = 4;
        }
        this.paramSize = this.precision;
        this.bufferLen = this.precision;
    }
}
exports.FloatParameter = FloatParameter;
/**
 * Parameter for boolean values
 */
class BooleanParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        this.type = 'BIT';
        this.jsType = 'JS_BOOLEAN';
        this.sqlType = 'SQL_BIT';
        this.cType = 'SQL_C_BIT';
        this.value = Boolean(value);
        this.precision = 1;
        this.paramSize = 1;
        this.bufferLen = 1;
    }
}
exports.BooleanParameter = BooleanParameter;
/**
 * Parameter for DateTime values
 */
class DateTimeParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        this.type = 'DATETIME';
        this.jsType = 'JS_DATE';
        this.sqlType = 'SQL_TYPE_TIMESTAMP';
        this.cType = 'SQL_C_TYPE_TIMESTAMP';
        this.value = value instanceof Date ? value : new Date(value);
        this.precision = 23;
        this.scale = 3; // Milliseconds
        this.paramSize = this.precision;
        this.bufferLen = 16; // sizeof(SQL_TIMESTAMP_STRUCT)
    }
}
exports.DateTimeParameter = DateTimeParameter;
/**
 * Parameter for Object values
 */
class ObjectParameter extends SqlParameter {
    constructor(value, options = {}) {
        super(options);
        this.type = 'VARCHAR';
        this.jsType = 'JS_OBJECT';
        this.sqlType = 'SQL_VARCHAR';
        this.cType = 'SQL_C_CHAR';
        // Serialize the object to JSON
        const jsonStr = JSON.stringify(value);
        this.value = value;
        this.serializedValue = jsonStr;
        this.precision = jsonStr.length;
        this.paramSize = jsonStr.length;
        this.bufferLen = Buffer.byteLength(jsonStr, 'utf8') + 1; // +1 for null terminator
        this.bytes = Buffer.from(jsonStr, 'utf8');
    }
}
exports.ObjectParameter = ObjectParameter;
/**
 * Base class for array parameters
 */
class ArrayParameter extends SqlParameter {
    constructor(array, elementType, options = {}) {
        super(options);
        this.type = 'ARRAY';
        this.elementType = elementType || 'UNKNOWN';
        this.jsType = 'JS_ARRAY';
        this.value = array;
        // Build null map
        this.nullMap = array.map(item => item === null || item === undefined);
        this.hasNulls = this.nullMap.some(isNull => isNull);
    }
}
exports.ArrayParameter = ArrayParameter;
/**
 * Parameter for string arrays
 */
class StringArrayParameter extends ArrayParameter {
    constructor(array, options = {}) {
        super(array, 'STRING', options);
        // Calculate max string length in the array
        this.maxStrLength = 0;
        this.encodedValues = [];
        for (let i = 0; i < array.length; i++) {
            if (this.nullMap[i]) {
                this.encodedValues[i] = null;
            }
            else {
                const strValue = String(array[i]);
                this.maxStrLength = Math.max(this.maxStrLength, strValue.length);
                this.encodedValues[i] = Buffer.from(strValue, this.encoding);
            }
        }
        // Ensure minimum size of 1
        this.maxStrLength = Math.max(1, this.maxStrLength);
        // Set up type information
        this.cType = 'SQL_C_WCHAR';
        this.precision = this.maxStrLength;
        // BCP handling vs. regular array
        if (options.isBcp) {
            this.sqlType = 'SQLNCHAR';
            this.isBcp = true;
            this.paramSize = 'SQL_VARLEN_DATA';
            this.bufferLen = this.maxStrLength + 1;
        }
        else {
            this.sqlType = this.maxStrLength > 2000 && this.maxStrLength < 4000
                ? 'SQL_WLONGVARCHAR'
                : 'SQL_WVARCHAR';
            this.paramSize = this.maxStrLength >= 4000 ? 0 : this.maxStrLength;
            this.bufferLen = this.maxStrLength * 2; // For UCS2, each char is 2 bytes
        }
    }
}
exports.StringArrayParameter = StringArrayParameter;
/**
 * Parameter for integer arrays
 */
class IntegerArrayParameter extends ArrayParameter {
    constructor(array, options = {}) {
        super(array, 'INTEGER', options);
        // Implementation similar to StringArrayParameter
        // For this example, adding a placeholder implementation
        this.cType = 'SQL_C_SBIGINT';
        this.sqlType = 'SQL_BIGINT';
        this.precision = 8; // Size of bigint
        this.paramSize = this.precision;
        this.bufferLen = this.precision;
    }
}
exports.IntegerArrayParameter = IntegerArrayParameter;
/**
 * Parameter for float arrays
 */
class FloatArrayParameter extends ArrayParameter {
    constructor(array, options = {}) {
        super(array, 'FLOAT', options);
        // Float array implementation
        this.cType = 'SQL_C_DOUBLE';
        this.sqlType = 'SQL_DOUBLE';
        this.precision = 8; // Size of double
        this.paramSize = this.precision;
        this.bufferLen = this.precision;
    }
}
exports.FloatArrayParameter = FloatArrayParameter;
/**
 * Parameter for boolean arrays
 */
class BooleanArrayParameter extends ArrayParameter {
    constructor(array, options = {}) {
        super(array, 'BIT', options);
        // Boolean array implementation
        this.cType = 'SQL_C_BIT';
        this.sqlType = 'SQL_BIT';
        this.precision = 1;
        this.paramSize = 1;
        this.bufferLen = 1;
    }
}
exports.BooleanArrayParameter = BooleanArrayParameter;
/**
 * Parameter for DateTime arrays
 */
class DateTimeArrayParameter extends ArrayParameter {
    constructor(array, options = {}) {
        super(array, 'DATETIME', options);
        // DateTime array implementation
        this.cType = 'SQL_C_TYPE_TIMESTAMP';
        this.sqlType = 'SQL_TYPE_TIMESTAMP';
        this.precision = 23;
        this.scale = 3; // Milliseconds
        this.paramSize = this.precision;
        this.bufferLen = 16; // sizeof(SQL_TIMESTAMP_STRUCT)
    }
}
exports.DateTimeArrayParameter = DateTimeArrayParameter;
/**
 * Class for handling Table-Valued Parameters
 * This is a placeholder implementation that can be expanded later
 */
class TVPParameter extends SqlParameter {
    constructor(tvpDef, options = {}) {
        super(options);
        this.type = 'TVP';
        this.jsType = 'JS_TABLE';
        this.sqlType = 'SQL_SS_TABLE';
        this.cType = 'SQL_C_DEFAULT';
        this.tableName = tvpDef.name;
        this.columns = tvpDef.columns;
        this.rows = tvpDef.rows;
        this.value = tvpDef;
        // These values would need to be properly calculated for actual implementation
        this.precision = 0;
        this.paramSize = 0;
        this.bufferLen = 0;
    }
}
exports.TVPParameter = TVPParameter;
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