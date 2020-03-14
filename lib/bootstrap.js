'use strict'

// ---------------------------------------------------------------------------------------------------------------------------------
// File: bootstrap.js
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
//
// thanks to node-sqlever-unofficial for this bootstrap.
//
// -------------------------cd --------------------------------------------------------------------------------------------------------

const bootModule = ((() => {
  function debugLoad () {
    const path = require('path')
    const binaryDir = __dirname
    const filename = '..\\build\\Debug\\sqlserverv8.node'
    console.log('DEBUG mode filename ' + filename)
    const native = path.join(binaryDir, filename)
    console.log('DEBUG loading from native ' + native)
    try {
      module.exports = require(native)
    } catch (e) {
      console.log('failed to load library.')
      console.log(e)
    }
  }

  function liveLoad () {
    // Try loading the correct lib for this platform/environment
    // If the require fails, we can just ignore the exception and continue trying
    try { module.exports = require('./bin/sqlserverv8.node.v13.11.0.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v13.11.0.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v10.16.0.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v10.16.0.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v11.15.0.electron.v5.0.13.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v11.15.0.electron.v5.0.13.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v11.15.0.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v11.15.0.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.electron.v6.1.9.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.electron.v6.1.9.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.electron.v7.1.13.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.electron.v7.1.13.x64.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.ia32.node') } catch (e) {}
    if (exported()) return
    try { module.exports = require('./bin/sqlserverv8.node.v12.13.1.x64.node') } catch (e) {}
    if (exported()) return

    failIfNoBinaryExported()

    function failIfNoBinaryExported () {
      if (noBinaryExported()) {
        throw new Error('None of the binaries loaded successfully. Is your node version >= 10.15 ?')
      }
    }

    function exported () {
      return Object.prototype.hasOwnProperty.call(module.exports, 'Connection')
    }

    function noBinaryExported () {
      return !Object.prototype.hasOwnProperty.call(module.exports, 'Connection')
    }
  }

  return {
    debugLoad: debugLoad,
    liveLoad: liveLoad
  }
})())

// bootModule.debugLoad()
bootModule.liveLoad()
