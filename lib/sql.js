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

var sql = require('./sqlserver.native');
var dm = require('./driverMgr');
var cw = require('./ConnectionWrapper');

function open(connectionString, callback) {

    dm.validateParameters(
        [
            {type: 'string', value: connectionString, name: 'connection string'},
            {type: 'function', value: callback, name: 'callback'}
        ],
        'open');

    var native = new sql.Connection();

    var q = [];

    function defaultCallback(err) {
        if (err) {
            throw new Error(err);
        }
    }

    function Connection() {
        return cw.ConnectionWrapper(q, defaultCallback, native);
    }

    var connection = new Connection();

    function onOpen(err) {
        callback(err, connection);
    }

    callback = callback || defaultCallback;

    native.open(connectionString, onOpen);

    return connection;
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
        if (chunky.callback) {
            if (err) chunky.callback(err);
            else chunky.callback(err, dm.objectify(results), more);
        }
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

