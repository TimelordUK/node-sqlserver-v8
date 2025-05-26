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

// Import unified logger for coordinated logging
import unifiedLogger from './unified-logger'
import { LogLevel } from './logger'

// Export logging functionality through unified logger
export const setLogLevel = (level: LogLevel) => unifiedLogger.setLogLevel(level)
export const enableConsoleLogging = (enabled: boolean) => unifiedLogger.setConsoleLogging(enabled)
export const setLogFile = (path: string | null) => unifiedLogger.setLogFile(path)
export { LogLevel }

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
  setLogLevel,
  enableConsoleLogging,
  setLogFile,
  LogLevel
}
