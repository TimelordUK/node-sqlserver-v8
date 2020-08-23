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
var sql = require('msnodesqlv8');
var supp = require('../samples/typescript/demo-support');
var argv = require('minimist')(process.argv.slice(2));
var assert = require('assert');
var support = null;
var procedureHelper = null;
var helper = null;
var getConnectionsSql = "SELECT \nDB_NAME(dbid) as DBName,\n    COUNT(dbid) as NumberOfConnections,\n    loginame as LoginName\nFROM\nsys.sysprocesses\nWHERE\ndbid > 0\nand DB_NAME(dbid) = 'scratch'\nGROUP BY\ndbid, loginame";
var PrintConnection = /** @class */ (function () {
    function PrintConnection() {
    }
    PrintConnection.prototype.test = function (conn_str, conn, done) {
        conn.query("select @@SPID as id, CURRENT_USER as name", function (err, res) {
            var sp = res[0]['id'];
            console.log("open[" + sp + "]:  " + conn_str);
            conn.query(getConnectionsSql, function (err, res) {
                var count = res[0]['NumberOfConnections'];
                conn.close(function () {
                    console.log("close[" + sp + "]: NumberOfConnections = " + count);
                    done();
                });
            });
        });
    };
    PrintConnection.prototype.run = function (conn_str, argv) {
        var _this = this;
        var delay = argv.delay || 5000;
        var repeats = argv.repeats || 10;
        console.log("" + conn_str);
        var iteration = 0;
        var repeatId = setInterval(function () {
            sql.open(conn_str, function (err, conn) {
                if (err) {
                    console.log(err);
                    throw err;
                }
                _this.test(conn_str, conn, function () {
                    ++iteration;
                    if (iteration == repeats) {
                        clearInterval(repeatId);
                    }
                });
            });
        }, delay);
    };
    return PrintConnection;
}());
var Benchmark = /** @class */ (function () {
    function Benchmark() {
    }
    Benchmark.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 500;
        var repeats = argv.repeats || 10;
        var prepared = argv.hasOwnProperty('prepared') || false;
        var stream = argv.hasOwnProperty('stream') || false;
        var table = argv.table || 'syscomments';
        var schema = argv.schema || 'master.';
        var columns = argv.columns || '*';
        var top = argv.top || -1;
        var query = top < 0 ?
            "select " + columns + " from " + schema + "." + table :
            "select top " + top + " " + columns + " from " + schema + "." + table;
        console.log("Benchmark query " + query);
        var runs = 0;
        var total = 0;
        var statement = null;
        function get_ready(done) {
            sql.open(conn_str, function (err, conn) {
                if (err) {
                    console.log(err);
                    throw err;
                }
                if (prepared) {
                    console.log("preparing query " + query);
                    conn.prepare(query, function (err, statement) {
                        var cols = statement.getMeta().map(function (x) { return x.name; }).join();
                        console.log(cols);
                        done(err, conn, statement);
                    });
                }
                else {
                    done(err, conn);
                }
            });
        }
        function get_data(conn, cb) {
            var rows = [];
            if (prepared) {
                if (stream) {
                    var q = statement.preparedQuery([]);
                    q.on('done', function () {
                        cb(null, rows);
                    });
                    q.on('row', function () {
                        rows[rows.length] = [];
                    });
                }
                else {
                    statement.preparedQuery([], cb);
                }
            }
            else {
                if (stream) {
                    var q = conn.query(query);
                    q.on('done', function () {
                        cb(null, rows);
                    });
                    q.on('row', function () {
                        rows[rows.length] = [];
                    });
                }
                else {
                    conn.query(query, cb);
                }
            }
        }
        get_ready(function (err, conn, ps) {
            if (err) {
                console.log(err);
                throw err;
            }
            var repeatId = null;
            function once(d, err, rows) {
                if (err) {
                    console.log(err.message);
                    throw err;
                }
                var elapsed = new Date().getTime() - d.getTime();
                ++runs;
                total += elapsed;
                console.log("[" + table + "\t] rows.length " + rows.length + " \t elapsed " + elapsed + "\t ms [ runs " + runs + " avg " + total / runs + " ]");
                if (runs == repeats) {
                    clearInterval(repeatId);
                    if (prepared) {
                        statement.free(function () {
                        });
                    }
                }
            }
            statement = ps;
            repeatId = setInterval(function () {
                var d = new Date();
                if (stream) {
                    get_data(conn, function (err, rows) {
                        once(d, err, rows);
                    });
                }
                else {
                    get_data(conn, function (err, rows) {
                        once(d, err, rows);
                        d = new Date();
                        get_data(conn, function (err, rows) {
                            once(d, err, rows);
                            d = new Date();
                            get_data(conn, function (err, rows) {
                                once(d, err, rows);
                            });
                        });
                    });
                }
            }, delay);
        });
    };
    return Benchmark;
}());
var ProcedureOut = /** @class */ (function () {
    function ProcedureOut() {
    }
    ProcedureOut.randomIntFromInterval = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };
    ProcedureOut.makeid = function () {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < ProcedureOut.randomIntFromInterval(10, 19); i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    };
    ProcedureOut.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 50;
        console.log(conn_str);
        sql.open(conn_str, function (err, theConnection) {
            if (err) {
                throw err;
            }
            if (err) {
                throw err;
            }
            var spName = 'test_sp_get_str_str';
            var s1 = ProcedureOut.makeid();
            var s2 = ProcedureOut.makeid();
            var def = "alter PROCEDURE <name>(\n@id INT,\n@name varchar(20) OUTPUT,\n@company varchar(20) OUTPUT\n\n)AS\nBEGIN\n" +
                ("   SET @name = '" + s1 + "'\n") +
                ("   SET @company = '" + s2 + "'\n") +
                '   RETURN 99;\n' +
                'END\n';
            var x = 0;
            procedureHelper.createProcedure(spName, def, function () {
                setInterval(function () {
                    var pm = theConnection.procedureMgr();
                    pm.callproc(spName, [1], function (err, results, output) {
                        assert.ifError(err);
                        var expected = [99, s1, s2];
                        console.log(JSON.stringify(output) + " x = " + x++);
                        assert.deepEqual(output, expected, 'results didn\'t match');
                    });
                }, delay);
            });
        });
    };
    return ProcedureOut;
}());
var Tvp = /** @class */ (function () {
    function Tvp() {
    }
    Tvp.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 3000;
        console.log(conn_str);
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            if (err) {
                throw err;
            }
            setTimeout(function () {
                var pm = conn.procedureMgr();
                pm.get('MyCustomStoredProcedure', function (procedure) {
                    var meta = procedure.getMeta();
                    var pTvp = {
                        a: "Father",
                        b: 999
                    };
                    procedure.call([pTvp], function (err, results) {
                        if (err) {
                            console.log(err);
                        }
                        else {
                            console.log(JSON.stringify(results));
                        }
                    });
                    console.log(JSON.stringify(meta));
                });
            }, delay);
        });
    };
    return Tvp;
}());
var DateTz = /** @class */ (function () {
    function DateTz() {
    }
    DateTz.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 5000;
        console.log(conn_str);
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            var x = 1;
            if (err) {
                throw err;
            }
            conn.setUseUTC(false);
            var expected = new Date('2009-05-27 00:00:00.000');
            setInterval(function () {
                var qs = "select convert(datetime, '2009-05-27 00:00:00.000') as test_field";
                console.log(qs);
                var q = conn.query(qs, function (err, results, more) {
                    console.log("[" + x + "] more = " + more + " err " + err + " expected " + expected + " results " + results[0].test_field);
                    assert.deepEqual(results[0].test_field, expected);
                    if (more)
                        return;
                    console.log("[" + x + "] completes more = " + more);
                    ++x;
                });
                q.on('msg', function (err) {
                    console.log("[" + x + "]: q.msg = " + err.message);
                });
            }, delay);
        });
    };
    return DateTz;
}());
var RaiseErrors = /** @class */ (function () {
    function RaiseErrors() {
    }
    RaiseErrors.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 5000;
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            var x = 1;
            if (err) {
                throw err;
            }
            setInterval(function () {
                var qs = '';
                var repeats = 3;
                for (var i = 0; i < repeats; ++i) {
                    qs += "RAISERROR('[" + x + "]: Error Number " + (i + 1) + "', 1, 1);";
                }
                var q = conn.query(qs, function (err, results, more) {
                    if (more && !err && results && results.length === 0) {
                        return;
                    }
                    console.log("[" + x + "] more = " + more + " err " + err + " results " + JSON.stringify(results));
                    if (more)
                        return;
                    console.log("[" + x + "] completes more = " + more);
                    ++x;
                });
                q.on('info', function (err) {
                    console.log("[" + x + "]: q.info = " + err.message);
                });
            }, delay);
        });
    };
    return RaiseErrors;
}());
var BusyConnection = /** @class */ (function () {
    function BusyConnection() {
    }
    BusyConnection.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 5000;
        var severity = argv.severity || 9;
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            var x = 1;
            setInterval(function () {
                var query = "RAISERROR('User JS Error " + severity + "', " + severity + ", 1);SELECT " + x + "+" + x + ";";
                console.log(query);
                conn.queryRaw(query, function (err, results, more) {
                    console.log(">> queryRaw");
                    console.log(err);
                    console.log(JSON.stringify(results, null, 2));
                    if (more)
                        return;
                    conn.queryRaw(query, function (e, r) {
                        console.log(">> queryRaw2");
                        console.log(e);
                        console.log(JSON.stringify(r, null, 2));
                        ++x;
                        console.log("<< queryRaw2");
                    });
                    console.log("<< queryRaw");
                });
            }, delay);
        });
    };
    return BusyConnection;
}());
var LargeStringSelect = /** @class */ (function () {
    function LargeStringSelect() {
    }
    LargeStringSelect.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 5000;
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            var x = 1;
            if (err) {
                throw err;
            }
            var p = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere.';
            var query = "SELECT 'Result' AS [Result], '" + p + "' AS [ReallyLongString]";
            setInterval(function () {
                var q = conn.query(query, function (err, results, more) {
                    console.log("[" + x + "] more = " + more + " err " + err + " results " + JSON.stringify(results));
                    if (more)
                        return;
                    ++x;
                });
                q.on('row', function (row) {
                    console.log("[column:" + x + "]: row = " + row);
                });
                q.on('column', function (col, data, more) {
                    console.log("[column:" + x + "]: col = " + col + " data.length " + data.length + ", more : " + more + " p.length " + p.length);
                });
            }, delay);
        });
    };
    return LargeStringSelect;
}());
var PrintSelect = /** @class */ (function () {
    function PrintSelect() {
    }
    PrintSelect.prototype.run = function (conn_str, argv) {
        var delay = argv.delay || 5000;
        sql.open(conn_str, function (err, conn) {
            if (err) {
                throw err;
            }
            var x = 1;
            if (err) {
                throw err;
            }
            setInterval(function () {
                conn.query("print 'JS status message " + x + "'; SELECT " + x + " + " + x + " as res;SELECT " + x + " * " + x + " as res2", function (err, results, more) {
                    if (more && !err && results && results.length === 0) {
                        return;
                    }
                    console.log("[" + x + "] more = " + more + " err " + err + " results " + JSON.stringify(results));
                    if (more)
                        return;
                    ++x;
                });
            }, delay);
        });
    };
    return PrintSelect;
}());
var MemoryStress = /** @class */ (function () {
    function MemoryStress() {
    }
    MemoryStress.prototype.promised = function (conn, sql) {
        return new Promise(function (accept, reject) {
            conn.queryRaw(sql, function (err, results) {
                if (err) {
                    reject(err);
                }
                accept(results);
            });
        });
    };
    MemoryStress.prototype.run = function (conn_str, argv) {
        var _this = this;
        var iterations = argv.iterations || 10000;
        sql.open(conn_str, function (err, conn) { return __awaiter(_this, void 0, void 0, function () {
            var x, iteration, results;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (err) {
                            throw err;
                        }
                        x = 1;
                        if (err) {
                            throw err;
                        }
                        iteration = 0;
                        _a.label = 1;
                    case 1:
                        if (!(iteration++ < iterations)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.promised(conn, "SELECT " + x + "+" + x + ";")];
                    case 2:
                        results = _a.sent();
                        if (iteration % 1000 === 0) {
                            console.log("iteration = " + iteration + " out of " + iterations);
                            console.log(results);
                        }
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
    };
    return MemoryStress;
}());
var test;
switch (argv.t) {
    case "tvp":
        test = new Tvp();
        break;
    case "datetz":
        test = new DateTz();
        break;
    case "busy":
        test = new BusyConnection();
        break;
    case "large":
        test = new LargeStringSelect();
        break;
    case "memory":
        test = new MemoryStress();
        break;
    case "print":
        test = new PrintSelect();
        break;
    case "errors":
        test = new RaiseErrors();
        break;
    case "connection":
        test = new PrintConnection();
        break;
    case "benchmark":
        test = new Benchmark();
        break;
    case "procedure":
        test = new ProcedureOut();
        break;
    default:
        console.log("test " + argv.t + " is not valid.");
        break;
}
if (test != null) {
    var global_conn_str_1 = null;
    if (argv.hasOwnProperty('a')) {
        var appVeyorVersion = argv['a'];
        global_conn_str_1 = "Driver={SQL Server Native Client 11.0}; Server=(local)\\SQL" + appVeyorVersion + "; Database={master}; Uid=sa; Pwd=Password12!";
        console.log("set conn_str as " + global_conn_str_1);
    }
    supp.GlobalConn.init(sql, function (co) {
        var conn_str = co.conn_str || global_conn_str_1;
        console.log("running test with " + conn_str);
        support = co.support;
        procedureHelper = new support.ProcedureHelper(conn_str);
        procedureHelper.setVerbose(false);
        helper = co.helper;
        test.run(conn_str, argv);
    }, global_conn_str_1);
}
//# sourceMappingURL=cmd-test.js.map