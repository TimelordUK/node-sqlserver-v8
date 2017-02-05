/**
 * Created by admin on 19/01/2017.
 */
"use strict";
var MsNodeSqlDriverApiModule;
(function (MsNodeSqlDriverApiModule) {
    var v8QueryEvent = (function () {
        function v8QueryEvent() {
        }
        v8QueryEvent.meta = 'meta';
        v8QueryEvent.column = 'column';
        v8QueryEvent.rowCount = 'rowCount';
        v8QueryEvent.row = 'row';
        v8QueryEvent.done = 'done';
        v8QueryEvent.error = 'error';
        v8QueryEvent.closed = 'closed';
        return v8QueryEvent;
    }());
    MsNodeSqlDriverApiModule.v8QueryEvent = v8QueryEvent;
})(MsNodeSqlDriverApiModule = exports.MsNodeSqlDriverApiModule || (exports.MsNodeSqlDriverApiModule = {}));
