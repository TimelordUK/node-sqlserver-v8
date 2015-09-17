# Note

This driver is branched from the Microsft node-sqlserver module. The MS team are working on an entirely new version and in the interim this version will be gradually improved to include new features.
# Microsoft / Contributors Node V8 Driver for Node.js for SQL Server

This version includes stored procedure support for SQL Server

1. supports input/output parameters.
2. captures return code from stored procedure.
3. will obtain meta data describing parameters.
4. compatibe with Node 0.12.x 
5. includes 64 bit/ia32 precompiled libraries.
6. npm package coming soon.
7. new features to be made available over coming months.

## Test

Included are a few unit tests.  They require mocha, async, and assert to be 
installed via npm.  Also, set the variables in test-config.js, then run the 
tests as follows:

    cd test
    node runtests.js

## Known Issues





