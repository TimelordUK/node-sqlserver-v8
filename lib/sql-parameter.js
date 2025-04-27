class SqlParameter {
  constructor (options = {}) {
    // Common properties for all parameter types
    this.type = null // Generic type category
    this.sqlType = null // SQL type (e.g., 'SQL_WVARCHAR')
    this.jsType = null // JS type representation
    this.cType = null // C type for binding
    this.precision = 0 // Type precision
    this.scale = 0 // Type scale (for numeric types)
    this.value = null // Original JS value
    this.paramSize = 0 // Size parameter for binding
    this.bufferLen = 0 // Buffer length for binding
    this.encoding = options.encoding || 'ucs2'

    // Apply any provided options
    Object.assign(this, options)
  }

  toString () {
    const valuePreview = this.formatValuePreview()
    return `SqlParameter(type=${this.type}, sqlType=${this.sqlType}, value=${valuePreview})`
  }

  formatValuePreview () {
    if (this.value === null || this.value === undefined) return 'null'

    if (typeof this.value === 'string') {
      // Truncate long strings
      return this.value.length > 20
        ? `"${this.value.substring(0, 17)}..."`
        : `"${this.value}"`
    }

    if (Array.isArray(this.value)) {
      return `[Array(${this.value.length})]`
    }

    if (this.value instanceof Date) {
      return `Date(${this.value.toISOString()})`
    }

    return String(this.value)
  }

  // Factory method to create the right parameter type
  static fromValue (value, options = {}) {
    if (value === null || value === undefined) {
      return new NullParameter()
    }

    if (typeof value !== 'object' || value instanceof Date) {
      return SqlParameter.fromScalarValue(value, options)
    }

    if (Array.isArray(value)) {
      return SqlParameter.fromArrayValue(value, options)
    }

    // Handle objects - may already be a parameter specification
    if (value.type && Object.prototype.hasOwnProperty.call(value, 'value')) {
      return SqlParameter.normalizeBindingObject(value, options)
    }

    // Default - treat as generic object
    return new ObjectParameter(value, options)
  }

  static fromScalarValue (value, options) {
    if (typeof value === 'string') {
      return new StringParameter(value, options)
    }
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? new IntegerParameter(value, options)
        : new FloatParameter(value, options)
    }
    if (typeof value === 'boolean') {
      return new BooleanParameter(value, options)
    }
    if (value instanceof Date) {
      return new DateTimeParameter(value, options)
    }

    // Default case - convert to string
    return new StringParameter(String(value), options)
  }

  static fromArrayValue (array, options) {
    if (array.length === 0) {
      return new ArrayParameter(array, 'UNKNOWN', options)
    }

    // Infer element type from first non-null element
    const firstNonNull = array.find(item => item !== null && item !== undefined)
    if (!firstNonNull) {
      // All nulls, default to string array
      return new ArrayParameter(array, 'STRING', options)
    }

    // Create appropriate array parameter based on element type
    if (typeof firstNonNull === 'string') {
      return new StringArrayParameter(array, options)
    }
    if (typeof firstNonNull === 'number') {
      return Number.isInteger(firstNonNull)
        ? new IntegerArrayParameter(array, options)
        : new FloatArrayParameter(array, options)
    }
    if (typeof firstNonNull === 'boolean') {
      return new BooleanArrayParameter(array, options)
    }
    if (firstNonNull instanceof Date) {
      return new DateTimeArrayParameter(array, options)
    }

    // Default - convert all to strings
    return new StringArrayParameter(array.map(item =>
      item === null || item === undefined ? null : String(item)
    ), options)
  }

  static normalizeBindingObject (spec, options) {
    // Create appropriate parameter type based on the spec
    const type = spec.type?.toUpperCase()

    switch (type) {
      case 'STRING':
        return new StringParameter(spec.value, { ...options, ...spec })
      case 'INTEGER':
        return new IntegerParameter(spec.value, { ...options, ...spec })
      case 'FLOAT':
        return new FloatParameter(spec.value, { ...options, ...spec })
      case 'BIT':
      case 'BOOLEAN':
        return new BooleanParameter(spec.value, { ...options, ...spec })
      case 'DATETIME':
        return new DateTimeParameter(spec.value, { ...options, ...spec })
      case 'ARRAY':
        // Handle array types based on elementType
        const elementType = spec.elementType?.toUpperCase()
        switch (elementType) {
          case 'STRING':
            return new StringArrayParameter(spec.value, { ...options, ...spec })
          case 'INTEGER':
            return new IntegerArrayParameter(spec.value, { ...options, ...spec })
          case 'FLOAT':
            return new FloatArrayParameter(spec.value, { ...options, ...spec })
          case 'BIT':
          case 'BOOLEAN':
            return new BooleanArrayParameter(spec.value, { ...options, ...spec })
          case 'DATETIME':
            return new DateTimeArrayParameter(spec.value, { ...options, ...spec })
          default:
            return new ArrayParameter(spec.value, elementType, { ...options, ...spec })
        }
      default:
        // For custom types, create generic parameter
        return new SqlParameter({ ...spec, ...options })
    }
  }
}

// Specific parameter types
class NullParameter extends SqlParameter {
  constructor (options = {}) {
    super(options)
    this.type = 'NULL'
    this.sqlType = 'SQL_NULL_DATA'
    this.jsType = 'JS_NULL'
    this.value = null
  }
}

class StringParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    const strValue = value === null || value === undefined ? '' : String(value)

    this.type = 'STRING'
    this.jsType = 'JS_STRING'
    this.value = strValue
    this.cType = 'SQL_C_WCHAR'

    // Calculate string properties
    const charLength = strValue.length
    const byteLength = Buffer.byteLength(strValue, this.encoding)

    // Set SQL type based on length
    if (charLength > 2000 && charLength < 4000) {
      this.sqlType = 'SQL_WLONGVARCHAR'
    } else {
      this.sqlType = 'SQL_WVARCHAR'
    }

    // For very large strings, use 0 for paramSize
    this.precision = charLength
    this.paramSize = charLength >= 4000 ? 0 : charLength
    this.bufferLen = byteLength + 2 // +2 for null terminator

    // Pre-encode for C++ convenience
    this.bytes = Buffer.from(strValue, this.encoding)
  }
}

class IntegerParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    this.type = 'INTEGER'
    this.jsType = 'JS_NUMBER'
    this.value = Number(value)
    this.cType = 'SQL_C_SBIGINT'

    // Determine size based on value range
    if (this.value >= -128 && this.value <= 127) {
      this.sqlType = 'SQL_TINYINT'
      this.precision = 1
    } else if (this.value >= -32768 && this.value <= 32767) {
      this.sqlType = 'SQL_SMALLINT'
      this.precision = 2
    } else if (this.value >= -2147483648 && this.value <= 2147483647) {
      this.sqlType = 'SQL_INTEGER'
      this.precision = 4
    } else {
      this.sqlType = 'SQL_BIGINT'
      this.precision = 8
    }

    this.paramSize = this.precision
    this.bufferLen = this.precision
  }
}

class FloatParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    this.type = 'FLOAT'
    this.jsType = 'JS_NUMBER'
    this.value = Number(value)

    // Determine precision
    const absValue = Math.abs(this.value)
    if ((absValue > 3.4e38) || (absValue < 1.2e-38 && absValue !== 0)) {
      this.sqlType = 'SQL_DOUBLE'
      this.cType = 'SQL_C_DOUBLE'
      this.precision = 8
    } else {
      this.sqlType = 'SQL_REAL'
      this.cType = 'SQL_C_FLOAT'
      this.precision = 4
    }

    this.paramSize = this.precision
    this.bufferLen = this.precision
  }
}

class BooleanParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    this.type = 'BIT'
    this.jsType = 'JS_BOOLEAN'
    this.sqlType = 'SQL_BIT'
    this.cType = 'SQL_C_BIT'
    this.value = Boolean(value)
    this.precision = 1
    this.paramSize = 1
    this.bufferLen = 1
  }
}

class DateTimeParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    this.type = 'DATETIME'
    this.jsType = 'JS_DATE'
    this.sqlType = 'SQL_TYPE_TIMESTAMP'
    this.cType = 'SQL_C_TYPE_TIMESTAMP'
    this.value = value instanceof Date ? value : new Date(value)
    this.precision = 23
    this.scale = 3 // Milliseconds
    this.paramSize = this.precision
    this.bufferLen = 16 // sizeof(SQL_TIMESTAMP_STRUCT)
  }
}

class ObjectParameter extends SqlParameter {
  constructor (value, options = {}) {
    super(options)
    this.type = 'VARCHAR'
    this.jsType = 'JS_OBJECT'
    this.sqlType = 'SQL_VARCHAR'
    this.cType = 'SQL_C_CHAR'

    // Serialize the object to JSON
    const jsonStr = JSON.stringify(value)
    this.value = value
    this.serializedValue = jsonStr

    this.precision = jsonStr.length
    this.paramSize = jsonStr.length
    this.bufferLen = Buffer.byteLength(jsonStr, 'utf8') + 1 // +1 for null terminator
    this.bytes = Buffer.from(jsonStr, 'utf8')
  }
}

class ArrayParameter extends SqlParameter {
  constructor (array, elementType, options = {}) {
    super(options)
    this.type = 'ARRAY'
    this.elementType = elementType || 'UNKNOWN'
    this.jsType = 'JS_ARRAY'
    this.value = array

    // Build null map
    this.nullMap = array.map(item => item === null || item === undefined)
    this.hasNulls = this.nullMap.some(isNull => isNull)
  }
}

class StringArrayParameter extends ArrayParameter {
  constructor (array, options = {}) {
    super(array, 'STRING', options)

    // Calculate max string length in the array
    this.maxStrLength = 0
    this.encodedValues = []

    for (let i = 0; i < array.length; i++) {
      if (this.nullMap[i]) {
        this.encodedValues[i] = null
      } else {
        const strValue = String(array[i])
        this.maxStrLength = Math.max(this.maxStrLength, strValue.length)
        this.encodedValues[i] = Buffer.from(strValue, this.encoding)
      }
    }

    // Ensure minimum size of 1
    this.maxStrLength = Math.max(1, this.maxStrLength)

    // Set up type information
    this.cType = 'SQL_C_WCHAR'
    this.precision = this.maxStrLength

    // BCP handling vs. regular array
    if (options.isBcp) {
      this.sqlType = 'SQLNCHAR'
      this.isBcp = true
      this.paramSize = 'SQL_VARLEN_DATA'
      this.bufferLen = this.maxStrLength + 1
    } else {
      this.sqlType = this.maxStrLength > 2000 && this.maxStrLength < 4000
        ? 'SQL_WLONGVARCHAR'
        : 'SQL_WVARCHAR'
      this.paramSize = this.maxStrLength >= 4000 ? 0 : this.maxStrLength
      this.bufferLen = this.maxStrLength * 2 // For UCS2, each char is 2 bytes
    }
  }
}

// Similar classes for other array types
class IntegerArrayParameter extends ArrayParameter {
  constructor (array, options = {}) {
    super(array, 'INTEGER', options)
    // Implementation similar to StringArrayParameter
    // but with integer-specific logic
    // ...
  }
}

class FloatArrayParameter extends ArrayParameter {
  constructor (array, options = {}) {
    super(array, 'FLOAT', options)
    // Float array implementation
    // ...
  }
}

class BooleanArrayParameter extends ArrayParameter {
  constructor (array, options = {}) {
    super(array, 'BIT', options)
    // Boolean array implementation
    // ...
  }
}

class DateTimeArrayParameter extends ArrayParameter {
  constructor (array, options = {}) {
    super(array, 'DATETIME', options)
    // DateTime array implementation
    // ...
  }
}

module.exports = {
  SqlParameter,
  fromValue: (value, options = {}) => SqlParameter.fromValue(value, options),
  // You can also export the specific parameter types if needed
  NullParameter,
  StringParameter,
  IntegerParameter,
  FloatParameter,
  BooleanParameter,
  DateTimeParameter,
  ObjectParameter,
  ArrayParameter,
  StringArrayParameter,
  IntegerArrayParameter,
  FloatArrayParameter,
  BooleanArrayParameter,
  DateTimeArrayParameter
}
