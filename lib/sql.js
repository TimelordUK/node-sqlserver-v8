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
var us = require('./user');

var nextid = 0;

function getConnectObject(p) {
    return typeof(p) === 'string' ?
    {
        conn_str: p,
        connect_timeout: 0
    }
        : p;
}

function open(params, callback) {
    return openFrom('open', params, callback);
}

function openFrom(parentFn, params, callback) {

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
                    {
                        type: 'string',
                        value: connectObj.conn_str,
                        name: 'connection string'
                    },
                    {
                        type: 'function',
                        value: callback,
                        name: 'callback'
                    }
                ],
                parentFn);

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

    var c = new Conn(getConnectObject(params), callback, nextid);
    ++nextid;
    c.open();

    return c.connection;
}

function query(connectDetails, queryOrObj, paramsOrCallback, callback) {
    var args = dm.getChunkyArgs(paramsOrCallback, callback);
    var fn = 'query';
    dm.validateQuery(queryOrObj, fn);
    var notify = new dm.StreamEvents();
    openFrom(fn, connectDetails, go);

    function go(err, conn) {
        if (err) {
            args.callback(err);
        } else {
            conn.queryNotify(notify, queryOrObj, args);
            notify.on('done', function () {
                conn.close();
            })
        }
    }

    return notify;
}

function queryRaw(connectDetails, queryOrObj, paramsOrCallback, callback) {
    var args = dm.getChunkyArgs(paramsOrCallback, callback);
    var fn = 'queryRaw';
    dm.validateQuery(queryOrObj, fn);
    var notify = new dm.StreamEvents();
    openFrom(fn, connectDetails, go);

    function go(err, conn) {
        if (err) {
            args.callback(err);
        } else {
            conn.queryRawNotify(notify, queryOrObj, paramsOrCallback, callback);
            notify.on('done', function () {
                conn.close();
            })
        }
    }

    return notify;
}

exports.open = open;
exports.query = query;
exports.queryRaw = queryRaw;

exports.Bit = us.Bit;

exports.BigInt = us.BigInt;
exports.Int = us.Int;
exports.TinyInt = us.TinyInt;
exports.SmallInt = us.SmallInt;

// todo: add support for user assigned length.
exports.VarBinary = us.VarBinary;
exports.LongVarBinary = us.LongVarBinary;
exports.Image = us.LongVarBinary;

exports.Float = us.Float;
exports.Numeric = us.Numeric;
exports.Money = us.Money;
exports.SmallMoney = us.Money;

exports.WVarChar = us.WVarChar;
exports.Double = us.Double;
exports.Decimal = us.Numeric;

exports.Real = us.Real;
exports.Char = us.Char; // sent as Utf8
exports.VarChar = us.VarChar; // sent as Utf8
exports.NChar = us.NChar; // 16 bit
exports.NVarChar = us.NVarChar; // 16 bit i.e. unicode
exports.Text = us.Text;
exports.NText = us.Text;
exports.Xml = us.Xml; // recommended to use wide 16 bit rather than char
exports.UniqueIdentifier = us.UniqueIdentifier;

exports.Time = us.Time;
exports.Date = us.MyDate;
exports.DateTime = us.DateTime;
exports.DateTime2 = us.DateTime2;
exports.DateRound = us.DateRound;
exports.SmallDateTime = us.SmallDateTime;
exports.DateTimeOffset = us.DateTimeOffset;