// src/sql-parameter.ts
// TypeScript will recognize BufferEncoding from @types/node

export type SqlScalarValue = string | number | boolean | Date | null | undefined
export type SqlArrayValue = SqlScalarValue[]
export type SqlValue = SqlScalarValue | SqlArrayValue | object
// src/sql-parameter.ts
// TypeScript will recognize BufferEncoding from @types/node

/**
 * Parameter options interface
 */
export interface SqlParameterOptions {
  encoding?: BufferEncoding
  isBcp?: boolean
  precision?: number
  scale?: number
  paramSize?: number | string
  sqlType?: string
  cType?: string
  type?: string
  jsType?: string
  elementType?: string
  // For TVP parameters
  tableName?: string
  columns?: TableColumn[]
  rows?: SqlValue[][]
  // For length specifications
  length?: number
  bufferLen?: number
  // For serialization options
  serializeOptions?: Record<string, any>
}

/**
 * Interface for binding objects with type specifications
 */
export interface BindingSpecification {
  type: string
  value: SqlValue
  elementType?: string
  precision?: number
  scale?: number
  paramSize?: number | string
  sqlType?: string
  cType?: string
  encoding?: BufferEncoding
  isBcp?: boolean
}

/**
 * Base SQL parameter class
 */
export class SqlParameter {
  // Common properties for all parameter types
  type: string | null = null // Generic type category
  sqlType: string | null | undefined = null // SQL type (e.g., 'SQL_WVARCHAR')
  jsType: string | null = null // JS type representation
  cType: string | null | undefined = null // C type for binding
  precision: number = 0 // Type precision
  scale: number = 0 // Type scale (for numeric types)
  value: SqlValue = null // Original JS value
  paramSize: number | string = 0 // Size parameter for binding
  bufferLen: number = 0 // Buffer length for binding
  encoding: BufferEncoding // Character encoding
  bytes?: Buffer // Pre-encoded bytes

  /**
   * Create a SQL parameter
   * @param options Parameter options
   */
  constructor (options: SqlParameterOptions = {}) {
    this.encoding = options.encoding ?? 'ucs2'

    // Apply any provided options
    Object.assign(this, options)
  }

  /**
   * Get string representation of parameter
   */
  toString (): string {
    const valuePreview = this.formatValuePreview()
    let result = `SqlParameter(type=${this.type}, sqlType=${this.sqlType}, jsType=${this.jsType}, value=${valuePreview})`

    // Add precision and scale for numeric types
    if (this.type === 'INTEGER' || this.type === 'FLOAT') {
      result += `, precision=${this.precision}`
      if (this.scale > 0) {
        result += `, scale=${this.scale}`
      }
    }

    // Add length info for string types
    if (this.type === 'STRING') {
      result += `, length=${this.precision}, bufferLen=${this.bufferLen}`
    }

    // Add array specific info
    if (this.type === 'ARRAY') {
      const arrayParam = this as unknown as ArrayParameter
      result += `, elementType=${arrayParam.elementType}, items=${(this.value as SqlArrayValue).length}`
      if (arrayParam.hasNulls) {
        result += ' (contains nulls)'
      }
    }

    // Add TVP specific info
    if (this.type === 'TVP') {
      const tvpParam = this as unknown as TVPParameter
      result += `, tableName=${tvpParam.tableName}, columns=${tvpParam.columns.length}, rows=${tvpParam.rows.length}`
    }

    // Add encoding info when present
    if (this.encoding && this.encoding !== 'ucs2') {
      result += `, encoding=${this.encoding}`
    }

    return result
  }

  // 3. Improved formatValuePreview method for better debug output
  formatValuePreview (): string {
    if (this.value === null || this.value === undefined) return 'null'

    if (typeof this.value === 'string') {
      // Truncate long strings
      return this.value.length > 20
        ? `"${this.value.substring(0, 17)}..."`
        : `"${this.value}"`
    }

    if (Array.isArray(this.value)) {
      // For small arrays, show actual values
      if (this.value.length <= 3) {
        const items = this.value.map(item => {
          if (item === null || item === undefined) return 'null'
          if (typeof item === 'string') return `"${item.length > 10 ? item.substring(0, 7) + '...' : item}"`
          return String(item)
        }).join(', ')
        return `[${items}]`
      }
      return `[Array(${this.value.length})]`
    }

    if (this.value instanceof Date) {
      return `Date(${this.value.toISOString()})`
    }

    if (typeof this.value === 'object') {
      try {
        // For objects, show a brief JSON representation
        const jsonStr = JSON.stringify(this.value)
        return jsonStr.length > 30 ? `${jsonStr.substring(0, 27)}...}` : jsonStr
      } catch (e) {
        return '[Object]'
      }
    }

    // For other values, convert to string
    return String(this.value)
  }

  /**
   * Factory method to create the right parameter type
   * @param value Parameter value
   * @param options Parameter options
   */
  static fromValue (value: SqlValue, options: SqlParameterOptions = {}): SqlParameter {
    if (value === null || value === undefined) {
      return new NullParameter()
    }

    if (typeof value !== 'object' || value instanceof Date) {
      return SqlParameter.fromScalarValue(value as SqlScalarValue, options)
    }

    if (Array.isArray(value)) {
      return SqlParameter.fromArrayValue(value as SqlArrayValue, options)
    }

    // Handle TVP - special case for Table-Valued Parameters
    if (typeof value === 'object' &&
        'name' in value &&
        'columns' in value &&
        'rows' in value) {
      return new TVPParameter(value as TableValuedParameter, options)
    }

    // Handle objects - may already be a parameter specification
    if (typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        'value' in value &&
        typeof value.type === 'string') {
      // Use a type guard to ensure we have a BindingSpecification
      const bindingObj = value as {
        type: string
        value: SqlValue
        elementType?: string
        [key: string]: any
      }
      return SqlParameter.normalizeBindingObject(bindingObj, options)
    }

    // Default - treat as generic object
    return new ObjectParameter(value, options)
  }

  /**
   * Create parameter from scalar value
   * @param value Scalar value
   * @param options Parameter options
   */
  private static fromScalarValue (value: SqlScalarValue, options: SqlParameterOptions): SqlParameter {
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

    // Default case - convert to string (handles undefined/null with default behavior)
    return new StringParameter(String(value), options)
  }

  /**
   * Create parameter from array value
   * @param array Array value
   * @param options Parameter options
   */
  private static fromArrayValue (array: SqlArrayValue, options: SqlParameterOptions): ArrayParameter {
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
      return new StringArrayParameter(array as Array<string | null | undefined>, options)
    }
    if (typeof firstNonNull === 'number') {
      return Number.isInteger(firstNonNull)
        ? new IntegerArrayParameter(array as Array<number | null | undefined>, options)
        : new FloatArrayParameter(array as Array<number | null | undefined>, options)
    }
    if (typeof firstNonNull === 'boolean') {
      return new BooleanArrayParameter(array as Array<boolean | null | undefined>, options)
    }
    if (firstNonNull instanceof Date) {
      return new DateTimeArrayParameter(array as Array<Date | null | undefined>, options)
    }

    // Default - convert all to strings
    return new StringArrayParameter(array.map(item =>
      item === null || item === undefined ? null : String(item)
    ) as Array<string | null | undefined>, options)
  }

  /**
   * Normalize a binding object
   * @param spec Parameter specification
   * @param options Parameter options
   */
  private static normalizeBindingObject (spec: BindingSpecification, options: SqlParameterOptions): SqlParameter {
    // Create appropriate parameter type based on the spec
    const type = spec.type.toUpperCase()
    const elementType = spec.elementType?.toUpperCase() ?? ''
    const arrayValue = spec.value as SqlArrayValue

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
    }

    switch (type) {
      case 'STRING':
        return new StringParameter(spec.value as string, mergedOptions)
      case 'INTEGER':
        return new IntegerParameter(spec.value as number, mergedOptions)
      case 'FLOAT':
        return new FloatParameter(spec.value as number, mergedOptions)
      case 'BIT':
      case 'BOOLEAN':
        return new BooleanParameter(spec.value as boolean, mergedOptions)
      case 'DATETIME':
        return new DateTimeParameter(spec.value as Date | string | number, mergedOptions)
      case 'ARRAY':
      // Handle array types based on elementType
        switch (elementType) {
          case 'STRING':
            return new StringArrayParameter(arrayValue as Array<string | null | undefined>, mergedOptions)
          case 'INTEGER':
            return new IntegerArrayParameter(arrayValue as Array<number | null | undefined>, mergedOptions)
          case 'FLOAT':
            return new FloatArrayParameter(arrayValue as Array<number | null | undefined>, mergedOptions)
          case 'BIT':
          case 'BOOLEAN':
            return new BooleanArrayParameter(arrayValue as Array<boolean | null | undefined>, mergedOptions)
          case 'DATETIME':
            return new DateTimeArrayParameter(arrayValue as Array<Date | string | number | null | undefined>, mergedOptions)
          default:
            return new ArrayParameter(arrayValue, elementType, mergedOptions)
        }
      default: {
        // For custom types, create a parameter with the custom type info
        const param = new SqlParameter(mergedOptions)
        param.type = spec.type // <-- Ensure we set the type properly
        param.value = spec.value
        param.sqlType = spec.sqlType
        param.cType = spec.cType
        return param
      }
    }
  }
}

/**
 * Parameter for null values
 */
export class NullParameter extends SqlParameter {
  constructor (options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'NULL'
    this.sqlType = 'SQL_NULL_DATA'
    this.jsType = 'JS_NULL'
    this.value = null
  }
}

/**
 * Parameter for string values
 */
export class StringParameter extends SqlParameter {
  constructor (value: string | null | undefined, options: SqlParameterOptions = {}) {
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
    if (options.sqlType) {
      this.sqlType = options.sqlType
    } else if (charLength > 2000 && charLength < 4000) {
      this.sqlType = 'SQL_WLONGVARCHAR'
    } else {
      this.sqlType = 'SQL_WVARCHAR'
    }

    // Use provided precision if available, otherwise use the character length
    this.precision = options.precision ?? charLength

    // For very large strings, use 0 for paramSize unless explicitly provided
    this.paramSize = options.paramSize ?? charLength >= 4000 ? 0 : charLength

    this.bufferLen = options.bufferLen ?? byteLength + 2 // +2 for null terminator

    // Pre-encode for C++ convenience
    this.bytes = Buffer.from(strValue, this.encoding)
  }

  // Add a specialized toString method for string parameters
  toString (): string {
    const valuePreview = this.formatValuePreview()
    return `StringParameter(${valuePreview}, length=${this.precision}, sqlType=${this.sqlType})`
  }
}

/**
 * Parameter for integer values
 */
export class IntegerParameter extends SqlParameter {
  constructor (value: number, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'INTEGER'
    this.jsType = 'JS_NUMBER'
    this.value = Number(value)
    this.cType = options.cType ?? 'SQL_C_SBIGINT'

    // Determine size based on value range, unless explicitly provided
    if (options.sqlType) {
      this.sqlType = options.sqlType
      this.precision = options.precision ?? 8 // Default to largest size if custom type
    } else if (this.value >= -128 && this.value <= 127) {
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

    // Override with provided precision if available
    if (options.precision !== undefined) {
      this.precision = options.precision
    }

    this.paramSize = options.paramSize ?? this.precision
    this.bufferLen = options.bufferLen ?? this.precision
  }
}

/**
 * Parameter for floating point values
 */
export class FloatParameter extends SqlParameter {
  constructor (value: number, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'FLOAT'
    this.jsType = 'JS_NUMBER'
    this.value = Number(value)

    // Determine precision
    const absValue = Math.abs(this.value)

    if (options.sqlType) {
      this.sqlType = options.sqlType
      this.cType = options.cType ?? 'SQL_C_DOUBLE'
      this.precision = options.precision ?? 8 // Default to double precision if custom type
    } else if (absValue > 3.4e38 || (absValue < 1.2e-38 && absValue !== 0)) {
      this.sqlType = 'SQL_DOUBLE'
      this.cType = 'SQL_C_DOUBLE'
      this.precision = 8
    } else {
      this.sqlType = 'SQL_REAL'
      this.cType = 'SQL_C_FLOAT'
      this.precision = 4
    }

    // Override with provided precision if available
    if (options.precision !== undefined) {
      this.precision = options.precision
    }

    // Set scale for decimal places if specified
    this.scale = options.scale ?? 0

    this.paramSize = options.paramSize ?? this.precision
    this.bufferLen = options.bufferLen ?? this.precision
  }
}

/**
 * Parameter for boolean values
 */
export class BooleanParameter extends SqlParameter {
  constructor (value: boolean, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'BIT'
    this.jsType = 'JS_BOOLEAN'
    this.sqlType = options.sqlType ?? 'SQL_BIT'
    this.cType = options.cType ?? 'SQL_C_BIT'
    this.value = Boolean(value)
    this.precision = options.precision ?? 1
    this.paramSize = options.paramSize ?? 1
    this.bufferLen = options.bufferLen ?? 1
  }
}

/**
 * Parameter for DateTime values
 */
export class DateTimeParameter extends SqlParameter {
  constructor (value: Date | string | number, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'DATETIME'
    this.jsType = 'JS_DATE'
    this.sqlType = options.sqlType ?? 'SQL_TYPE_TIMESTAMP'
    this.cType = options.cType ?? 'SQL_C_TYPE_TIMESTAMP'
    this.value = value instanceof Date ? value : new Date(value)
    this.precision = options.precision ?? 23
    this.scale = options.scale ?? 3 // Milliseconds by default
    this.paramSize = options.paramSize ?? this.precision
    this.bufferLen = options.bufferLen ?? 16 // sizeof(SQL_TIMESTAMP_STRUCT)
  }
}

/**
 * Parameter for Object values
 */
export class ObjectParameter extends SqlParameter {
  serializedValue: string

  constructor (value: object, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'VARCHAR'
    this.jsType = 'JS_OBJECT'
    this.sqlType = 'SQL_VARCHAR'
    this.cType = 'SQL_C_CHAR'

    // Use serialization options if provided
    const serializeOptions = options.serializeOptions ?? undefined

    // Serialize the object to JSON
    const jsonStr = JSON.stringify(value, serializeOptions?.replacer, serializeOptions?.space)
    this.value = value
    this.serializedValue = jsonStr

    this.precision = jsonStr.length
    this.paramSize = jsonStr.length
    this.bufferLen = Buffer.byteLength(jsonStr, 'utf8') + 1 // +1 for null terminator
    this.bytes = Buffer.from(jsonStr, 'utf8')
  }

  // Add a specialized toString method for object parameters
  toString (): string {
    return `ObjectParameter(keys=${Object.keys(this.value as object).length}, serializedLength=${this.serializedValue.length})`
  }
}

/**
 * Base class for array parameters
 */
export class ArrayParameter extends SqlParameter {
  elementType: string
  jsType: string
  nullMap: boolean[]
  hasNulls: boolean

  constructor (array: SqlArrayValue, elementType: string, options: SqlParameterOptions = {}) {
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

/**
 * Parameter for string arrays
 */
export class StringArrayParameter extends ArrayParameter {
  maxStrLength: number
  encodedValues: Array<Buffer | null>
  isBcp?: boolean

  constructor (array: Array<string | null | undefined>, options: SqlParameterOptions = {}) {
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

/**
 * Parameter for integer arrays
 */
export class IntegerArrayParameter extends ArrayParameter {
  constructor (array: Array<number | null | undefined>, options: SqlParameterOptions = {}) {
    super(array, 'INTEGER', options)
    // Implementation similar to StringArrayParameter
    // For this example, adding a placeholder implementation

    this.cType = 'SQL_C_SBIGINT'
    this.sqlType = 'SQL_BIGINT'
    this.precision = 8 // Size of bigint
    this.paramSize = this.precision
    this.bufferLen = this.precision
  }
}

/**
 * Parameter for float arrays
 */
export class FloatArrayParameter extends ArrayParameter {
  constructor (array: Array<number | null | undefined>, options: SqlParameterOptions = {}) {
    super(array, 'FLOAT', options)
    // Float array implementation

    this.cType = 'SQL_C_DOUBLE'
    this.sqlType = 'SQL_DOUBLE'
    this.precision = 8 // Size of double
    this.paramSize = this.precision
    this.bufferLen = this.precision
  }
}

/**
 * Parameter for boolean arrays
 */
export class BooleanArrayParameter extends ArrayParameter {
  constructor (array: Array<boolean | null | undefined>, options: SqlParameterOptions = {}) {
    super(array, 'BIT', options)
    // Boolean array implementation

    this.cType = 'SQL_C_BIT'
    this.sqlType = 'SQL_BIT'
    this.precision = 1
    this.paramSize = 1
    this.bufferLen = 1
  }
}

/**
 * Parameter for DateTime arrays
 */
export class DateTimeArrayParameter extends ArrayParameter {
  constructor (array: Array<Date | string | number | null | undefined>, options: SqlParameterOptions = {}) {
    super(array, 'DATETIME', options)
    // DateTime array implementation

    this.cType = 'SQL_C_TYPE_TIMESTAMP'
    this.sqlType = 'SQL_TYPE_TIMESTAMP'
    this.precision = 23
    this.scale = 3 // Milliseconds
    this.paramSize = this.precision
    this.bufferLen = 16 // sizeof(SQL_TIMESTAMP_STRUCT)
  }
}

// Add placeholder for TVP type
export interface TableValuedParameter {
  name: string
  columns: TableColumn[]
  rows: SqlArrayValue[]
}

export interface TableColumn {
  name: string
  type: string
  nullable?: boolean
}

/**
 * Class for handling Table-Valued Parameters
 * This is a placeholder implementation that can be expanded later
 */
export class TVPParameter extends SqlParameter {
  tableName: string
  columns: TableColumn[]
  rows: SqlValue[][]

  constructor (tvpDef: TableValuedParameter, options: SqlParameterOptions = {}) {
    super(options)
    this.type = 'TVP'
    this.jsType = 'JS_TABLE'
    this.sqlType = 'SQL_SS_TABLE'
    this.cType = 'SQL_C_DEFAULT'

    this.tableName = tvpDef.name
    this.columns = tvpDef.columns
    this.rows = tvpDef.rows
    this.value = tvpDef

    // These values would need to be properly calculated for actual implementation
    this.precision = 0
    this.paramSize = 0
    this.bufferLen = 0
  }
}

/**
 * Helper function to create a parameter from a value
 * @param value The parameter value
 * @param options Additional parameter options
 * @returns A new SqlParameter instance
 */
export function fromValue (value: SqlValue, options: SqlParameterOptions = {}): SqlParameter {
  return SqlParameter.fromValue(value, options)
}
