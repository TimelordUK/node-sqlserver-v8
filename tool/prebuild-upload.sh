#!/bin/bash

# Prebuild with upload script
# Usage: GITHUB_TOKEN=your_token ./prebuild-upload.sh
# Or: export GITHUB_TOKEN=your_token && ./prebuild-upload.sh

# Check if GITHUB_TOKEN is set in environment or .env file
if [ -z "$GITHUB_TOKEN" ]; then
    # Try to load from .env file if it exists
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    fi
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set"
    echo "Usage: GITHUB_TOKEN=your_token ./prebuild-upload.sh"
    echo "Or create a .env file with GITHUB_TOKEN=your_token"
    exit 1
fi

# Set compiler to gcc-10 for compatibility
export CC=${CC:-gcc-10}
export CXX=${CXX:-g++-10}

echo "Using compiler: $CC / $CXX"

# Run prebuild with upload
node_modules/.bin/prebuild -t 18.20.0 -t 20.18.0 -t 22.12.0 -t 23.0.0 -t 24.0.0  --strip --verbose -u "$GITHUB_TOKEN" -j 4 | tee ./build.log 2>&1
