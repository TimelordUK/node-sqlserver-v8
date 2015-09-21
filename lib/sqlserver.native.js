//---------------------------------------------------------------------------------------------------------------------------------
// File: sqlserver.native.js
// Contents: javascript which loads the native part of the Microsoft Driver for Node.js for SQL Server
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

var os = require('os');
var native;
try {
    var arch = os.arch();
    native = './sqlserver.'  + arch + '.node';
    module.exports = require(native);
} catch (e) {
    console.error('Native sqlserver cannot be loaded. Make sure you are running on 0.12 node runtime ' + native );
    throw e;
}