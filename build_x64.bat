call node-gyp clean configure build --verbose
copy build\Release\sqlserverv8.node lib\sqlserverv8.%node_ver%.x64.node

