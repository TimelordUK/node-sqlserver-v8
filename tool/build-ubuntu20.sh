#!/bin/bash

# Build script for Ubuntu 20.04 compatible binaries

# Check GCC version
gcc_version=$(gcc -dumpversion)
echo "Current GCC version: $gcc_version"

# If GCC > 10, try to use gcc-10
if command -v gcc-10 &> /dev/null; then
    export CC=gcc-10
    export CXX=g++-10
    echo "Using gcc-10 for compatibility"
else
    echo "Warning: gcc-10 not found, using default compiler"
    echo "This may cause GLIBC compatibility issues"
fi

# Clean previous builds
rm -rf build/
rm -rf prebuilds/

# Run prebuild
npm run prebuild-linux

echo "Build complete. Check prebuilds/ directory for binaries."