// src/index.ts
import { loadNativeModule } from './native-module'
import { Connection } from './connection'
import {
  SqlParameter,
  fromValue,
  StringParameter,
  FloatParameter,
  IntegerParameter,
  BooleanParameter,
  DateTimeParameter,
  NullParameter,
  ArrayParameter,
  StringArrayParameter,
  IntegerArrayParameter,
  FloatArrayParameter,
  BooleanArrayParameter,
  DateTimeArrayParameter,
  ObjectParameter,
  TVPParameter,
  SqlParameterOptions,
  SqlValue,
  SqlScalarValue,
  SqlArrayValue,
  BindingSpecification,
  TableValuedParameter,
  TableColumn
} from './sql-parameter'

// Load the native module
const nativeModule = loadNativeModule()

/**
 * Create a new database connection
 * @returns A new Connection instance
 */
function createConnection (): Connection {
  return new Connection(new nativeModule.Connection())
}

// Export the API
export {
  // Core classes
  Connection,

  // Parameter types
  SqlParameter,
  StringParameter,
  IntegerParameter,
  FloatParameter,
  BooleanParameter,
  DateTimeParameter,
  NullParameter,
  ArrayParameter,
  StringArrayParameter,
  IntegerArrayParameter,
  FloatArrayParameter,
  BooleanArrayParameter,
  DateTimeArrayParameter,
  ObjectParameter,
  TVPParameter,

  // Type interfaces
  type SqlParameterOptions,
  type SqlValue,
  type SqlScalarValue,
  type SqlArrayValue,
  type BindingSpecification,
  type TableValuedParameter,
  type TableColumn,

  // Factory functions
  createConnection,
  fromValue
}

// Export utility functions directly from the native module
export const setLogLevel = nativeModule.setLogLevel
export const enableConsoleLogging = nativeModule.enableConsoleLogging
export const setLogFile = nativeModule.setLogFile

// Default export for CommonJS compatibility
export default {
  Connection,
  SqlParameter,
  StringParameter,
  IntegerParameter,
  FloatParameter,
  BooleanParameter,
  DateTimeParameter,
  NullParameter,
  ArrayParameter,
  StringArrayParameter,
  IntegerArrayParameter,
  FloatArrayParameter,
  BooleanArrayParameter,
  DateTimeArrayParameter,
  ObjectParameter,
  TVPParameter,
  createConnection,
  fromValue,
  setLogLevel: nativeModule.setLogLevel,
  enableConsoleLogging: nativeModule.enableConsoleLogging,
  setLogFile: nativeModule.setLogFile
}
