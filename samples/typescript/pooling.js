"use strict";
exports.__esModule = true;
exports.sql = void 0;
// require the module so it can be used in your node JS code.
exports.sql = require('msnodesqlv8');
function getConnection() {
    var path = require('path');
    var config = require(path.join(__dirname, '..\\javascript\\config.json'));
    return config.connection.local;
}
var str = getConnection();
var pool = new exports.sql.Pool({
    connectionString: str
});
pool.on('open', function (options) {
    console.log("ready options = " + JSON.stringify(options, null, 4));
});
pool.on('debug', function (msg) {
    console.log("\t\t\t\t\t\t" + new Date().toLocaleTimeString() + " <pool.debug> " + msg);
});
pool.on('status', function (s) {
    console.log("status = " + JSON.stringify(s, null, 4));
});
pool.on('error', function (e) {
    console.log(e);
});
var testSql = 'waitfor delay \'00:00:10\';';
function submit(sql) {
    var q = pool.query(sql);
    var timeStr = new Date().toLocaleTimeString();
    console.log("send " + timeStr + ", sql = " + sql);
    q.on('submitted', function (d) {
        console.log("query submitted " + timeStr + ", sql = " + d.query_str);
        q.on('done', function () { return console.log("query done " + timeStr); });
    });
    return q;
}
var _loop_1 = function (i) {
    var q = submit(testSql);
    switch (i) {
        case 5:
            console.log('cancel a query');
            q.cancelQuery();
            break;
        case 6:
            q.pauseQuery();
            setTimeout(function () {
                console.log('resume a paused query');
                q.resumeQuery();
            }, 50000);
            break;
        default:
            break;
    }
};
for (var i = 0; i < 7; ++i) {
    _loop_1(i);
}
setInterval(function () {
    submit(testSql);
}, 60000);
pool.open(function (e, options) {
    if (e) {
        console.log("Error " + e.message);
    }
    else {
        console.log(JSON.stringify(options, null, 4));
    }
});
