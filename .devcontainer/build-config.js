// build-config.js - Common configuration for both node-gyp and CMake
const fs = require('fs');
const path = require('path');
const os = require('os');

// Platform detection
const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = !isWindows && !isMac;

// Common configuration
const config = {
  cppStandard: "c++20",
  defines: {
    common: ["UNICODE", "BUILDING_NODE_EXTENSION", "NAPI_DISABLE_CPP_EXCEPTIONS"],
    windows: ["WINDOWS_BUILD", "NODE_GYP_V4"],
    linux: ["LINUX_BUILD"],
    mac: ["LINUX_BUILD"] // Mac uses same defines as Linux for this project
  },
  odbcLibs: {
    windows: "odbc32",
    linux: "-lodbc",
    mac: "-lodbc"
  },
  // Find SQL Server ODBC drivers
  findMsOdbcPaths: () => {
    const possiblePaths = [
      // Windows paths
      'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC',
      // Linux paths
      '/opt/microsoft/msodbcsql18/include/',
      '/opt/microsoft/msodbcsql17/include/',
      // Mac paths
      '/usr/local/opt/msodbcsql18/include/',
      '/usr/local/opt/msodbcsql17/include/'
    ];
    
    return possiblePaths.filter(p => fs.existsSync(p));
  }
};

// Export for Node.js usage
if (typeof module !== 'undefined') {
  module.exports = config;
}

// When run directly, output in format usable by CMake
if (require.main === module) {
  const platform = isWindows ? 'windows' : (isMac ? 'mac' : 'linux');
  
  // Format for CMake consumption
  console.log(`set(CPP_STANDARD "${config.cppStandard}")`);
  
  // Output defines
  const allDefines = [
    ...config.defines.common,
    ...config.defines[platform]
  ];
  console.log(`set(PLATFORM_DEFINES "${allDefines.join(';')}")`);
  
  // Output ODBC lib
  console.log(`set(ODBC_LIB "${config.odbcLibs[platform]}")`);
  
  // Output SQL Server paths
  const msOdbcPaths = config.findMsOdbcPaths();
  console.log(`set(MS_ODBC_PATHS "${msOdbcPaths.join(';')}")`);
}