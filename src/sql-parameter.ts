// src/sql-parameter.ts

/**
 * Options for SQL parameters
 */
export interface SqlParameterOptions {
  precision?: number
  scale?: number
  length?: number
  nullable?: boolean
  [key: string]: any
}

/**
 * Represents a SQL parameter with type information and options
 */
export class SqlParameter {
  name: string
  type: string | number
  value: any
  options: SqlParameterOptions

  /**
   * Create a new SQL parameter
   * @param name Parameter name or identifier
   * @param type SQL type name or identifier
   * @param value Parameter value
   * @param options Additional parameter options
   */
  constructor (name: string, type: string | number, value: any, options: SqlParameterOptions = {}) {
    this.name = name
    this.type = type
    this.value = value
    this.options = options
  }

  /**
   * Create a parameter from a value, inferring the type
   * @param value The parameter value
   * @param options Additional parameter options
   * @returns A new SqlParameter instance
   */
  static fromValue (value: any, options: SqlParameterOptions = {}): SqlParameter {
    // Determine SQL type from JS value type
    let type: string

    if (value === null || value === undefined) {
      type = 'NULL'
    } else if (typeof value === 'string') {
      type = 'NVARCHAR'
    } else if (typeof value === 'number') {
      type = Number.isInteger(value) ? 'INT' : 'FLOAT'
    } else if (value instanceof Date) {
      type = 'DATETIME'
    } else if (value instanceof Buffer) {
      type = 'VARBINARY'
    } else if (typeof value === 'boolean') {
      type = 'BIT'
    } else {
      // Default for objects and other types
      type = 'NVARCHAR'
    }

    return new SqlParameter('', type, value, options)
  }
}

/**
 * Helper function to create a parameter from a value
 * @param value The parameter value
 * @param options Additional parameter options
 * @returns A new SqlParameter instance
 */
export function fromValue (value: any, options: SqlParameterOptions = {}): SqlParameter {
  return SqlParameter.fromValue(value, options)
}
