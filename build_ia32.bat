call node-gyp clean configure build --verbose --arch=ia32
copy build\Release\sqlserverv8.node lib\sqlserverv8.%node_ver%.ia32.node

