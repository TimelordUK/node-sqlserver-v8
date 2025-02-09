#!/bin/bash

# ensure a new version is provided

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version> (e.g. , v4.5.0)"
  exit 1
fi

NEW_VERSION="$1"
GITHUB_TOKEN="${GITHUB_TOKEN:?Error: GITHUB_TOKEN is not set}"

# git hub repo details
OWNER="TimelordUK"
REPO="node-sqlserver-v8"
API_URL="https://api.github.com/repos/$OWNER/$REPO/releases/latest"
UPLOAD_URL="https://uloads.github.com/repos/$OWNER/$REPO/releases"
DOWNLOAD_DIR="downloads"

# create download directory if not existing.
mkdir -p "$DOWNLOAD_DIR"

# fetch the latest release information
echo "Fetching latest release from $API_URL..."
RELEASE_JSON=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "$API_URL")
echo "$RELEASE_JSON"

ASSETS_URLS=$(echo "$RELEASE_JSON" | jq -r '.assets[].browser_download_url')

# Extract assets URL
FIRST_URL=$(echo "$ASSETS_URLS" | head -n 1)
OLD_VERSION=$(echo "$FIRST_URL" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)

echo "first $FIRST_URL"

# validate old version extraction
if [ -z "$OLD_VERSION" ]; then
  echo "Error: Unable to extract the current version from assets URLs."
  exit 1
fi

echo "Detected old version: $OLD_VERSION"
echo "Replacing with new version: $NEW_VERSION"

# Download all assets and rename
echo "Downloading and renaming assets..."
RENAMED_FILES=()
for URL in $ASSETS_URLS; do
  FILENAME=$(basename "$URL")
  NEW_FILENAME=${FILENAME/$OLD_VERSION/$NEW_VERSION}

  echo "Downloading $FILENAME... with url $URL $DOWNLOAD_DIR/$FILENAME"
  curl -L "$URL" -o "$DOWNLOAD_DIR/$FILENAME"

  # rename the file
  
  echo "file $FILENAME new $NEW_FILENAME $OLD_VERSION $NEW_VERSION"
  if [[ "$FILENAME" != "$NEW_FILENAME" ]]; then
    mv "$DOWNLOAD_DIR/$FILENAME" "$DOWNLOAD_DIR/$NEW_FILENAME"
    echo "Renamed to $NEW_FILENAME"
  fi

  RENAMED_FILES+=("$DOWNLOAD_DIR/$NEW_FILENAME")
done

echo "All assets downloadd and renamed."

# Step 2: Create a new release
echo "Creating new Github release: $NEW_VERSION..."

CREATE_RELEASE_RESPONSE=$(curl -s -X POST "https://api.github.com/repos/$OWNER/$REPO/releases" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
    {
      "tag_name": "$NEW_VERSION",
      "name": "$NEW_VERSION",
      "body": "Automated release for $NEW_VERSION, replicating previous assets.",
      "draft": false,
      "prerelease": false
    }
EOF
)

# Extract new release ID and upload URL

NEW_RELEASE_ID=$(echo "$CREATE_RELEASE_RESPONSE" | jq -r '.id')
NEW_UPLOAD_URL=$(echo "$CREATE_RELEASE_RESPONSE" | jq -r '.upload_url' | sed "s/{?name,label}//")

if [ -z "$NEW_RELEASE_ID" ] || [ "$NEW_RELEASE_ID" == "null" ]; then
  echo "Error: Failed to create new release."
  exit 1
fi

echo "New release created: $NEW_VERSION (ID: $NEW_RELEASE_ID)"

# Step 3: Upload assets to new release
echo "uploading renamed assets to Github release ..."

for FILE in "${RENAMED_FILES[@]}"; do
  BASENAME=$(basename "$FILE")
  echo "uploading $BASENAME to $NEW_UPLOAD_URL?name=$BASENAME"
  curl -s -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    "$NEW_UPLOAD_URL?name=$BASENAME" \
    --data-binary @"$FILE"

  echo "Uploaded: $BASENAME"
done

echo "All assets uploaded successfully to releases $NEW_VERSION!"




