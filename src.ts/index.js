"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevel = exports.setLogFile = exports.enableConsoleLogging = exports.setLogLevel = exports.fromValue = exports.TVPParameter = exports.ObjectParameter = exports.DateTimeArrayParameter = exports.BooleanArrayParameter = exports.FloatArrayParameter = exports.IntegerArrayParameter = exports.StringArrayParameter = exports.ArrayParameter = exports.NullParameter = exports.DateTimeParameter = exports.BooleanParameter = exports.FloatParameter = exports.IntegerParameter = exports.StringParameter = exports.SqlParameter = exports.Connection = void 0;
exports.createConnection = createConnection;
// src/index.ts
var native_module_1 = require("./native-module");
var connection_1 = require("./connection");
Object.defineProperty(exports, "Connection", { enumerable: true, get: function () { return connection_1.Connection; } });
var sql_parameter_1 = require("./sql-parameter");
Object.defineProperty(exports, "SqlParameter", { enumerable: true, get: function () { return sql_parameter_1.SqlParameter; } });
Object.defineProperty(exports, "fromValue", { enumerable: true, get: function () { return sql_parameter_1.fromValue; } });
Object.defineProperty(exports, "StringParameter", { enumerable: true, get: function () { return sql_parameter_1.StringParameter; } });
Object.defineProperty(exports, "FloatParameter", { enumerable: true, get: function () { return sql_parameter_1.FloatParameter; } });
Object.defineProperty(exports, "IntegerParameter", { enumerable: true, get: function () { return sql_parameter_1.IntegerParameter; } });
Object.defineProperty(exports, "BooleanParameter", { enumerable: true, get: function () { return sql_parameter_1.BooleanParameter; } });
Object.defineProperty(exports, "DateTimeParameter", { enumerable: true, get: function () { return sql_parameter_1.DateTimeParameter; } });
Object.defineProperty(exports, "NullParameter", { enumerable: true, get: function () { return sql_parameter_1.NullParameter; } });
Object.defineProperty(exports, "ArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.ArrayParameter; } });
Object.defineProperty(exports, "StringArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.StringArrayParameter; } });
Object.defineProperty(exports, "IntegerArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.IntegerArrayParameter; } });
Object.defineProperty(exports, "FloatArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.FloatArrayParameter; } });
Object.defineProperty(exports, "BooleanArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.BooleanArrayParameter; } });
Object.defineProperty(exports, "DateTimeArrayParameter", { enumerable: true, get: function () { return sql_parameter_1.DateTimeArrayParameter; } });
Object.defineProperty(exports, "ObjectParameter", { enumerable: true, get: function () { return sql_parameter_1.ObjectParameter; } });
Object.defineProperty(exports, "TVPParameter", { enumerable: true, get: function () { return sql_parameter_1.TVPParameter; } });
// Load the native module
var nativeModule = (0, native_module_1.loadNativeModule)();
/**
 * Create a new database connection
 * @returns A new Connection instance
 */
function createConnection() {
    return new connection_1.Connection(new nativeModule.Connection());
}
// Import unified logger for coordinated logging
var unified_logger_1 = require("./unified-logger");
var logger_1 = require("./logger");
Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function () { return logger_1.LogLevel; } });
// Export logging functionality through unified logger
var setLogLevel = function (level) { return unified_logger_1.default.setLogLevel(level); };
exports.setLogLevel = setLogLevel;
var enableConsoleLogging = function (enabled) { return unified_logger_1.default.setConsoleLogging(enabled); };
exports.enableConsoleLogging = enableConsoleLogging;
var setLogFile = function (path) { return unified_logger_1.default.setLogFile(path); };
exports.setLogFile = setLogFile;
// Default export for CommonJS compatibility
exports.default = {
    Connection: connection_1.Connection,
    SqlParameter: sql_parameter_1.SqlParameter,
    StringParameter: sql_parameter_1.StringParameter,
    IntegerParameter: sql_parameter_1.IntegerParameter,
    FloatParameter: sql_parameter_1.FloatParameter,
    BooleanParameter: sql_parameter_1.BooleanParameter,
    DateTimeParameter: sql_parameter_1.DateTimeParameter,
    NullParameter: sql_parameter_1.NullParameter,
    ArrayParameter: sql_parameter_1.ArrayParameter,
    StringArrayParameter: sql_parameter_1.StringArrayParameter,
    IntegerArrayParameter: sql_parameter_1.IntegerArrayParameter,
    FloatArrayParameter: sql_parameter_1.FloatArrayParameter,
    BooleanArrayParameter: sql_parameter_1.BooleanArrayParameter,
    DateTimeArrayParameter: sql_parameter_1.DateTimeArrayParameter,
    ObjectParameter: sql_parameter_1.ObjectParameter,
    TVPParameter: sql_parameter_1.TVPParameter,
    createConnection: createConnection,
    fromValue: sql_parameter_1.fromValue,
    setLogLevel: exports.setLogLevel,
    enableConsoleLogging: exports.enableConsoleLogging,
    setLogFile: exports.setLogFile,
    LogLevel: logger_1.LogLevel
};
