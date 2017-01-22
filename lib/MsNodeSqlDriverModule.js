"use strict";
var MsNodeSqlDriverModule;
(function (MsNodeSqlDriverModule) {
    (function (v8Events) {
        v8Events[v8Events["meta"] = 0] = "meta";
        v8Events[v8Events["column"] = 1] = "column";
        v8Events[v8Events["rowCount"] = 2] = "rowCount";
        v8Events[v8Events["row"] = 3] = "row";
        v8Events[v8Events["done"] = 4] = "done";
        v8Events[v8Events["error"] = 5] = "error";
    })(MsNodeSqlDriverModule.v8Events || (MsNodeSqlDriverModule.v8Events = {}));
    var v8Events = MsNodeSqlDriverModule.v8Events;
})(MsNodeSqlDriverModule = exports.MsNodeSqlDriverModule || (exports.MsNodeSqlDriverModule = {}));
//# sourceMappingURL=MsNodeSqlDriverModule.js.map