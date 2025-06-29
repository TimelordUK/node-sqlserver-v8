#!/bin/bash
set -e

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: Please set GITHUB_TOKEN environment variable"
    echo "Usage: GITHUB_TOKEN=ghp_xxx... ./build.sh"
    exit 1
fi

echo "Building Docker image..."
docker build -t msnodesqlv8-prebuild .

echo "Running prebuild in container..."
docker run --rm -e GITHUB_TOKEN="$GITHUB_TOKEN" -e BRANCH="$BRANCH" -v $(pwd)/prebuilds:/home/apprunner/build/prebuilds msnodesqlv8-prebuild

echo "Prebuild artifacts should now be in ./prebuilds/"