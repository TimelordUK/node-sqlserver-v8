//---------------------------------------------------------------------------------------------------------------------------------
// File: sql.js
// Contents: javascript interface to Microsoft Driver for Node.js  for SQL Server
// 
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------


var dm = require('./driverMgr');
var cw = require('./ConnectionWrapper');
var sql = require('./sqlserver.native');

var nextid = 0;

function Conn(p, cb, id) {

    var callback = cb;
    var q = [];
    var native = new sql.Connection();
    var connection = new cw.ConnectionWrapper(q, defaultCallback, native, id);
    var connectObj = p;

    function defaultCallback(err) {
        if (err) {
            throw new Error(err);
        }
    }

    function open() {

        dm.validateParameters(
            [
                {type: 'string', value: connectObj.conn_str, name: 'connection string'},
                {type: 'function', value: callback, name: 'callback'}
            ],
            'open');

        callback = callback || defaultCallback;

        function queueCb(err) {
            setImmediate(function () {
                callback(err, connection);
            });
        }

        native.open(connectObj, queueCb);
    }

    this.id = connection.id;
    this.connection = connection;
    this.open = open;

    return this;
}

function getConnectObject(p) {
    var params = typeof(p) === 'string' ?
    {
        conn_str: p,
        connect_timeout: 0
    }
        : p;

    return params;
}

function getQueryObject(p) {
    var params = typeof(p) === 'string' ?
    {
        query_str: p,
        query_timeout: 0
    }
        : p;

    return params;
}

function open(params, callback) {
    var c = new Conn(getConnectObject(params), callback, nextid);
    ++nextid;
    c.open();

    return c.connection;
}

function query(connectDetails, queryOrObj, paramsOrCallback, callback) {

    var queryObj = getQueryObject(queryOrObj);
    var connectObj = getConnectObject(connectDetails);

    dm.validateParameters(
        [
            {type: 'string', value: connectObj.conn_str, name: 'connection string'},
            {type: 'string', value: queryObj.query_str, name: 'query string'}
        ],
        'query');

    var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

    return queryRaw(connectObj, queryObj, chunky.params, function (err, results, more) {
        setImmediate(function () {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, dm.objectify(results), more);
            }
        });
    });
}

function queryRaw(connectDetails, queryOrObj, paramsOrCallback, callback) {

    var queryObj = getQueryObject(queryOrObj);
    var connectObj = getConnectObject(connectDetails);

    dm.validateParameters(
        [
            {type: 'string', value: connectObj.conn_str, name: 'connection string'},
            {type: 'string', value: queryObj.query_str, name: 'query string'}
        ],
        'queryRaw');

    var ext = new sql.Connection();
    var notify = new dm.StreamEvents();
    var q = [];

    var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

    chunky.callback = chunky.callback || function (err) {
            if (err) {
                throw new Error(err);
            }
        };

    function onOpen(err, connection) {

        if (err) {
            if (connection) {
                connection.close();
            }
            chunky.callback(err);
            return;
        }

        dm.readall(q, notify, ext, queryObj, chunky.params, false, function (err, results, more) {
            if (err) {
                connection.close();
                dm.routeStatementError(err, chunky.callback, notify);
                return;
            }

            if (chunky.callback) {

                // otherwise just close the connection and rethrow the connection, which generally
                // results in uncaught exception.
                try {

                    chunky.callback(err, results, more);
                }
                catch (ex) {
                    // close the connection and rethrow the exception as is
                    connection.close();
                    throw ex;
                }
            }

            if (!more) {
                connection.close();
            }
        });
    }

    ext.open(connectObj, onOpen);

    return notify;
}

function SqlTypes() {

    var SQL_UNKNOWN_TYPE = 0;
    var SQL_CHAR = 1;
    var SQL_NUMERIC = 2;
    var SQL_DECIMAL = 3;
    var SQL_INTEGER = 4;
    var SQL_SMALLINT = 5;
    var SQL_FLOAT = 6;
    var SQL_REAL = 7;
    var SQL_DOUBLE = 8;
    var SQL_INTERVAL = 10;
    var SQL_TIMESTAMP = 11;
    var SQL_LONGVARCHAR =  -1;
    var SQL_BINARY =  -2;
    var SQL_VARBINARY  = -3;
    var SQL_LONGVARBINARY =  -4;
    var SQL_BIGINT =  -5;
    var SQL_TINYINT =  -6;
    var SQL_BIT =  -7;
    var SQL_WCHAR = -8;
    var SQL_WVARCHAR = -9;
    var SQL_WLONGVARCHAR = -10;
    var SQL_SS_VARIANT = -150;
    var SQL_SS_UDT = -151;
    var SQL_SS_XML = -152;
    var SQL_SS_TABLE = -153;
    var SQL_SS_TIME2 = -154;
    var SQL_SS_TIMESTAMPOFFSET = -155;

    // currently mapped in the driver .. either through a guess by looking at type or explicitly from user

    this.SQL_VARBINARY = SQL_VARBINARY;
    this.SQL_INTEGER = SQL_INTEGER;
    this.SQL_WVARCHAR = SQL_WVARCHAR;
    this.SQL_SS_TIMESTAMPOFFSET = SQL_SS_TIMESTAMPOFFSET;
    this.SQL_BIT = SQL_BIT;
    this.SQL_BIGINT = SQL_BIGINT;
    this.SQL_DOUBLE = SQL_DOUBLE;
};

var sqlTypes = new SqlTypes();

exports.open = open;
exports.query = query;
exports.queryRaw = queryRaw;

exports.VarBinary = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_VARBINARY,
        value : p
    }
    return ret;
};

exports.Integer = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_INTEGER,
        value : p
    }
    return ret;
};

exports.WVarChar = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_WVARCHAR,
        value : p
    }
    return ret;
};

exports.SSTimeStampOffset = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_SS_TIMESTAMPOFFSET,
        value : p
    }
    return ret;
};

exports.Bit = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_BIT,
        value : p
    }
    return ret;
};

exports.BigInt = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_BIGINT,
        value : p
    }
    return ret;
};

exports.Double = function(p) {
    var ret = {
        sql_type : sqlTypes.SQL_DOUBLE,
        value : p
    }
    return ret;
};