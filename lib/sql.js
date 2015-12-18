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

function Conn(cs, cb, id) {

    var callback = cb;
    var q = [];
    var native = new sql.Connection();
    var connection = new cw.ConnectionWrapper(q, defaultCallback, native, id);

    var connectionString = cs;

    function defaultCallback(err) {
        if (err) {
            throw new Error(err);
        }
    }

    function open() {

        dm.validateParameters(
            [
                {type : 'string', value: connectionString, name : 'connection string'},
                {type : 'function', value: callback, name : 'callback'}
            ],
            'open');

        callback = callback || defaultCallback;

        native.open(connectionString, function (err) {
            setImmediate(function() {
                callback(err, connection);
            });
        });
    }

    this.id = connection.id;
    this.connection = connection;
    this.open = open;

    return this;
}

function open(connectionString, callback) {
    var c = new Conn(connectionString, callback, nextid);
    ++nextid;
    c.open();

    return c.connection;
}

function query(connectionString, query, paramsOrCallback, callback) {

    dm.validateParameters(
        [
            {type: 'string', value: connectionString, name: 'connection string'},
            {type: 'string', value: query, name: 'query string'}
        ],
        'query');

    var chunky = dm.getChunkyArgs(paramsOrCallback, callback);

    return queryRaw(connectionString, query, chunky.params, function (err, results, more) {
        setImmediate(function() {
            if (chunky.callback) {
                if (err) chunky.callback(err);
                else chunky.callback(err, dm.objectify(results), more);
            }
        });
    });
}

function queryRaw(connectionString, query, paramsOrCallback, callback) {

    dm.validateParameters(
        [
            {type: 'string', value: connectionString, name: 'connection string'},
            {type: 'string', value: query, name: 'query string'}
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

        dm.readall(q, notify, ext, query, chunky.params, false, function (err, results, more) {
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

    ext.open(connectionString, onOpen);

    return notify;
}

exports.open = open;
exports.query = query;
exports.queryRaw = queryRaw;