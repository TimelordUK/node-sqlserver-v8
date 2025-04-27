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
        var _a;
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
        this.encoding = (_a = options.encoding) !== null && _a !== void 0 ? _a : 'ucs2';
        // Apply any provided options
        Object.assign(this, options);
    }
    /**
     * Get string representation of parameter
     */
    toString() {
        const valuePreview = this.formatValuePreview();
        let result = `SqlParameter(type=${this.type}, sqlType=${this.sqlType}, jsType=${this.jsType}, value=${valuePreview})`;
        // Add precision and scale for numeric types
        if (this.type === 'INTEGER' || this.type === 'FLOAT') {
            result += `, precision=${this.precision}`;
            if (this.scale > 0) {
                result += `, scale=${this.scale}`;
            }
        }
        // Add length info for string types
        if (this.type === 'STRING') {
            result += `, length=${this.precision}, bufferLen=${this.bufferLen}`;
        }
        // Add array specific info
        if (this.type === 'ARRAY') {
            const arrayParam = this;
            result += `, elementType=${arrayParam.elementType}, items=${this.value.length}`;
            if (arrayParam.hasNulls) {
                result += ' (contains nulls)';
            }
        }
        // Add TVP specific info
        if (this.type === 'TVP') {
            const tvpParam = this;
            result += `, tableName=${tvpParam.tableName}, columns=${tvpParam.columns.length}, rows=${tvpParam.rows.length}`;
        }
        // Add encoding info when present
        if (this.encoding && this.encoding !== 'ucs2') {
            result += `, encoding=${this.encoding}`;
        }
        return result;
    }
    // 3. Improved formatValuePreview method for better debug output
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
            // For small arrays, show actual values
            if (this.value.length <= 3) {
                const items = this.value.map(item => {
                    if (item === null || item === undefined)
                        return 'null';
                    if (typeof item === 'string')
                        return `"${item.length > 10 ? item.substring(0, 7) + '...' : item}"`;
                    return String(item);
                }).join(', ');
                return `[${items}]`;
            }
            return `[Array(${this.value.length})]`;
        }
        if (this.value instanceof Date) {
            return `Date(${this.value.toISOString()})`;
        }
        if (typeof this.value === 'object') {
            try {
                // For objects, show a brief JSON representation
                const jsonStr = JSON.stringify(this.value);
                return jsonStr.length > 30 ? `${jsonStr.substring(0, 27)}...}` : jsonStr;
            }
            catch (e) {
                return '[Object]';
            }
        }
        // For other values, convert to string
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
        var _a, _b;
        // Create appropriate parameter type based on the spec
        const type = spec.type.toUpperCase();
        const elementType = (_b = (_a = spec.elementType) === null || _a === void 0 ? void 0 : _a.toUpperCase()) !== null && _b !== void 0 ? _b : '';
        const arrayValue = spec.value;
        // Extract precision and other properties from the spec
        const mergedOptions = {
            ...options,
            type: spec.type, // <-- Add this line to include the original type
            precision: spec.precision,
            scale: spec.scale,
            paramSize: spec.paramSize,
            sqlType: spec.sqlType,
            cType: spec.cType,
            encoding: spec.encoding,
            isBcp: spec.isBcp
        };
        switch (type) {
            case 'STRING':
                return new StringParameter(spec.value, mergedOptions);
            case 'INTEGER':
                return new IntegerParameter(spec.value, mergedOptions);
            case 'FLOAT':
                return new FloatParameter(spec.value, mergedOptions);
            case 'BIT':
            case 'BOOLEAN':
                return new BooleanParameter(spec.value, mergedOptions);
            case 'DATETIME':
                return new DateTimeParameter(spec.value, mergedOptions);
            case 'ARRAY':
                // Handle array types based on elementType
                switch (elementType) {
                    case 'STRING':
                        return new StringArrayParameter(arrayValue, mergedOptions);
                    case 'INTEGER':
                        return new IntegerArrayParameter(arrayValue, mergedOptions);
                    case 'FLOAT':
                        return new FloatArrayParameter(arrayValue, mergedOptions);
                    case 'BIT':
                    case 'BOOLEAN':
                        return new BooleanArrayParameter(arrayValue, mergedOptions);
                    case 'DATETIME':
                        return new DateTimeArrayParameter(arrayValue, mergedOptions);
                    default:
                        return new ArrayParameter(arrayValue, elementType, mergedOptions);
                }
            default: {
                // For custom types, create a parameter with the custom type info
                const param = new SqlParameter(mergedOptions);
                param.type = spec.type; // <-- Ensure we set the type properly
                param.value = spec.value;
                param.sqlType = spec.sqlType;
                param.cType = spec.cType;
                return param;
            }
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
        var _a, _b, _c;
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
        if (options.sqlType) {
            this.sqlType = options.sqlType;
        }
        else if (charLength > 2000 && charLength < 4000) {
            this.sqlType = 'SQL_WLONGVARCHAR';
        }
        else {
            this.sqlType = 'SQL_WVARCHAR';
        }
        // Use provided precision if available, otherwise use the character length
        this.precision = (_a = options.precision) !== null && _a !== void 0 ? _a : charLength;
        // For very large strings, use 0 for paramSize unless explicitly provided
        this.paramSize = ((_b = options.paramSize) !== null && _b !== void 0 ? _b : charLength >= 4000) ? 0 : charLength;
        this.bufferLen = (_c = options.bufferLen) !== null && _c !== void 0 ? _c : byteLength + 2; // +2 for null terminator
        // Pre-encode for C++ convenience
        this.bytes = Buffer.from(strValue, this.encoding);
    }
    // Add a specialized toString method for string parameters
    toString() {
        const valuePreview = this.formatValuePreview();
        return `StringParameter(${valuePreview}, length=${this.precision}, sqlType=${this.sqlType})`;
    }
}
exports.StringParameter = StringParameter;
/**
 * Parameter for integer values
 */
class IntegerParameter extends SqlParameter {
    constructor(value, options = {}) {
        var _a, _b, _c, _d;
        super(options);
        this.type = 'INTEGER';
        this.jsType = 'JS_NUMBER';
        this.value = Number(value);
        this.cType = (_a = options.cType) !== null && _a !== void 0 ? _a : 'SQL_C_SBIGINT';
        // Determine size based on value range, unless explicitly provided
        if (options.sqlType) {
            this.sqlType = options.sqlType;
            this.precision = (_b = options.precision) !== null && _b !== void 0 ? _b : 8; // Default to largest size if custom type
        }
        else if (this.value >= -128 && this.value <= 127) {
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
        // Override with provided precision if available
        if (options.precision !== undefined) {
            this.precision = options.precision;
        }
        this.paramSize = (_c = options.paramSize) !== null && _c !== void 0 ? _c : this.precision;
        this.bufferLen = (_d = options.bufferLen) !== null && _d !== void 0 ? _d : this.precision;
    }
}
exports.IntegerParameter = IntegerParameter;
/**
 * Parameter for floating point values
 */
class FloatParameter extends SqlParameter {
    constructor(value, options = {}) {
        var _a, _b, _c, _d, _e;
        super(options);
        this.type = 'FLOAT';
        this.jsType = 'JS_NUMBER';
        this.value = Number(value);
        // Determine precision
        const absValue = Math.abs(this.value);
        if (options.sqlType) {
            this.sqlType = options.sqlType;
            this.cType = (_a = options.cType) !== null && _a !== void 0 ? _a : 'SQL_C_DOUBLE';
            this.precision = (_b = options.precision) !== null && _b !== void 0 ? _b : 8; // Default to double precision if custom type
        }
        else if (absValue > 3.4e38 || (absValue < 1.2e-38 && absValue !== 0)) {
            this.sqlType = 'SQL_DOUBLE';
            this.cType = 'SQL_C_DOUBLE';
            this.precision = 8;
        }
        else {
            this.sqlType = 'SQL_REAL';
            this.cType = 'SQL_C_FLOAT';
            this.precision = 4;
        }
        // Override with provided precision if available
        if (options.precision !== undefined) {
            this.precision = options.precision;
        }
        // Set scale for decimal places if specified
        this.scale = (_c = options.scale) !== null && _c !== void 0 ? _c : 0;
        this.paramSize = (_d = options.paramSize) !== null && _d !== void 0 ? _d : this.precision;
        this.bufferLen = (_e = options.bufferLen) !== null && _e !== void 0 ? _e : this.precision;
    }
}
exports.FloatParameter = FloatParameter;
/**
 * Parameter for boolean values
 */
class BooleanParameter extends SqlParameter {
    constructor(value, options = {}) {
        var _a, _b, _c, _d, _e;
        super(options);
        this.type = 'BIT';
        this.jsType = 'JS_BOOLEAN';
        this.sqlType = (_a = options.sqlType) !== null && _a !== void 0 ? _a : 'SQL_BIT';
        this.cType = (_b = options.cType) !== null && _b !== void 0 ? _b : 'SQL_C_BIT';
        this.value = Boolean(value);
        this.precision = (_c = options.precision) !== null && _c !== void 0 ? _c : 1;
        this.paramSize = (_d = options.paramSize) !== null && _d !== void 0 ? _d : 1;
        this.bufferLen = (_e = options.bufferLen) !== null && _e !== void 0 ? _e : 1;
    }
}
exports.BooleanParameter = BooleanParameter;
/**
 * Parameter for DateTime values
 */
class DateTimeParameter extends SqlParameter {
    constructor(value, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        super(options);
        this.type = 'DATETIME';
        this.jsType = 'JS_DATE';
        this.sqlType = (_a = options.sqlType) !== null && _a !== void 0 ? _a : 'SQL_TYPE_TIMESTAMP';
        this.cType = (_b = options.cType) !== null && _b !== void 0 ? _b : 'SQL_C_TYPE_TIMESTAMP';
        this.value = value instanceof Date ? value : new Date(value);
        this.precision = (_c = options.precision) !== null && _c !== void 0 ? _c : 23;
        this.scale = (_d = options.scale) !== null && _d !== void 0 ? _d : 3; // Milliseconds by default
        this.paramSize = (_e = options.paramSize) !== null && _e !== void 0 ? _e : this.precision;
        this.bufferLen = (_f = options.bufferLen) !== null && _f !== void 0 ? _f : 16; // sizeof(SQL_TIMESTAMP_STRUCT)
    }
}
exports.DateTimeParameter = DateTimeParameter;
/**
 * Parameter for Object values
 */
class ObjectParameter extends SqlParameter {
    constructor(value, options = {}) {
        var _a;
        super(options);
        this.type = 'VARCHAR';
        this.jsType = 'JS_OBJECT';
        this.sqlType = 'SQL_VARCHAR';
        this.cType = 'SQL_C_CHAR';
        // Use serialization options if provided
        const serializeOptions = (_a = options.serializeOptions) !== null && _a !== void 0 ? _a : undefined;
        // Serialize the object to JSON
        const jsonStr = JSON.stringify(value, serializeOptions === null || serializeOptions === void 0 ? void 0 : serializeOptions.replacer, serializeOptions === null || serializeOptions === void 0 ? void 0 : serializeOptions.space);
        this.value = value;
        this.serializedValue = jsonStr;
        this.precision = jsonStr.length;
        this.paramSize = jsonStr.length;
        this.bufferLen = Buffer.byteLength(jsonStr, 'utf8') + 1; // +1 for null terminator
        this.bytes = Buffer.from(jsonStr, 'utf8');
    }
    // Add a specialized toString method for object parameters
    toString() {
        return `ObjectParameter(keys=${Object.keys(this.value).length}, serializedLength=${this.serializedValue.length})`;
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