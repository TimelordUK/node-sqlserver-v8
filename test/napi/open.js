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
// test/napi/open.ts
var chai_1 = require("chai");
var nativeModule = require("msnodesqlv8");
var test_connection_factory_1 = require("../common/test-connection-factory");
// Set logging options
nativeModule.setLogLevel(4); // Debug level
nativeModule.enableConsoleLogging(true);
describe('open', function () {
    this.timeout(0);
    var connection = null;
    var factory = new test_connection_factory_1.TestConnectionFactory();
    beforeEach(function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, factory.createTestConnection()];
                    case 1:
                        // Create connection using the default connection string
                        connection = _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    });
    afterEach(function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, connection.promises.close()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    });
    it('will call open on the cpp object', function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                console.log('Connection opened successfully');
                (0, chai_1.expect)(connection).to.not.be.null;
                return [2 /*return*/];
            });
        });
    });
    // Additional test to verify we can connect with a specific key
    it('can open connection with a specific key if available', function () {
        return __awaiter(this, void 0, void 0, function () {
            var connectionKeys, specificKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        connectionKeys = factory.getAvailableConnectionKeys();
                        if (!(connectionKeys.length > 0)) return [3 /*break*/, 4];
                        specificKey = connectionKeys[0];
                        console.log("Testing connection with key: ".concat(specificKey));
                        if (!connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, connection.promises.close()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, factory.createConnectionByKey(specificKey)];
                    case 3:
                        // Create a new connection with the specific key
                        connection = _a.sent();
                        (0, chai_1.expect)(connection).to.not.be.null;
                        return [3 /*break*/, 5];
                    case 4:
                        this.skip();
                        _a.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    });
});
