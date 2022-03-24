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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
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
exports.__esModule = true;
exports.sql = void 0;
// require the module so it can be used in your node JS code.
exports.sql = require('msnodesqlv8');
var path = require('path');
var GetConnection = require(path.join(__dirname, '..\\javascript\\', '../javascript/get-connection')).GetConnection;
var connectionString = new GetConnection().connectionString;
function builder() {
    return __awaiter(this, void 0, void 0, function () {
        function makeOne(i) {
            return {
                id: i,
                col_a: i * 5,
                col_b: "str_" + i,
                col_c: i + 1,
                col_d: i - 1,
                col_e: "str2_" + i
            };
        }
        var rows, connection, tableName, mgr, builder_1, vec, t, create, drop, keys, res, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    rows = 5;
                    return [4 /*yield*/, exports.sql.promises.open(connectionString)];
                case 1:
                    connection = _a.sent();
                    tableName = 'tmpTableBuilder';
                    mgr = connection.tableMgr();
                    builder_1 = mgr.makeBuilder(tableName);
                    builder_1.setDialect(mgr.ServerDialect.SqlServer);
                    builder_1.addColumn('id').asInt().isPrimaryKey(1);
                    builder_1.addColumn('col_a').asInt();
                    builder_1.addColumn('col_b').asVarChar(100);
                    builder_1.addColumn('col_c').asInt();
                    builder_1.addColumn('col_d').asInt();
                    builder_1.addColumn('col_e').asVarChar(100);
                    vec = Array(rows).fill(0).map(function (_, i) { return makeOne(i); });
                    t = builder_1.toTable();
                    create = builder_1.createTableSql;
                    drop = builder_1.dropTableSql;
                    console.log(drop);
                    return [4 /*yield*/, builder_1.drop()];
                case 2:
                    _a.sent();
                    console.log(create);
                    return [4 /*yield*/, builder_1.create()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, t.promises.insert(vec)];
                case 4:
                    _a.sent();
                    keys = t.keys(vec);
                    return [4 /*yield*/, t.promises.select(keys)];
                case 5:
                    res = _a.sent();
                    console.log(JSON.stringify(res, null, 4));
                    return [4 /*yield*/, builder_1.drop()];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, connection.promises.close()];
                case 7:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 8:
                    e_1 = _a.sent();
                    console.log(e_1);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, builder()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
run().then(function () {
    console.log('done');
});
