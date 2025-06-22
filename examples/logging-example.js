"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// examples/logging-example.ts
var logger_facade_1 = require("../src/logger-facade");
var src_1 = require("../src");
// Example 1: Configure for development
logger_facade_1.logger.configureDevelopment({
    logLevel: logger_facade_1.LogLevel.DEBUG
});
// Example 2: Configure for production
// logger.configureProduction({
//   logDirectory: '/var/log/myapp',
//   logLevel: LogLevel.INFO,
//   rotateDaily: true
// })
// Example 3: Configure for testing
// logger.configureTest({
//   logLevel: LogLevel.TRACE,
//   silent: false,
//   logFile: './test-logs/test.log'
// })
// Create a class-specific logger
var connectionLogger = (0, logger_facade_1.createLogger)('ConnectionManager', {
    module: 'database',
    version: '1.0.0'
});
// Use the logger
logger_facade_1.logger.info('Application starting...');
connectionLogger.debug('Initializing connection pool');
// Both TypeScript and C++ logs will be coordinated
function demonstrateLogging() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    conn = (0, src_1.createConnection)();
                    connectionLogger.info('Opening database connection', {
                        timestamp: new Date().toISOString()
                    });
                    return [4 /*yield*/, conn.promises.open('Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;')];
                case 1:
                    _a.sent();
                    connectionLogger.info('Connection established successfully');
                    return [4 /*yield*/, conn.promises.submitReadAll('SELECT 1 as test')];
                case 2:
                    result = _a.sent();
                    logger_facade_1.logger.debug('Query result', { rows: result });
                    return [4 /*yield*/, conn.promises.close()];
                case 3:
                    _a.sent();
                    connectionLogger.info('Connection closed');
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    connectionLogger.error('Database error occurred', {
                        error: error_1.message,
                        stack: error_1.stack
                    });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Log configuration info
var config = logger_facade_1.logger.getConfiguration();
logger_facade_1.logger.info('Current logger configuration', config);
// Run the example
demonstrateLogging().catch(console.error);
