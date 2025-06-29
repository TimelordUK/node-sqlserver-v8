#!/bin/bash
# Script to remove gitignored files that have already been committed

# Step 1: Make sure we have the latest .gitignore
echo "Ensuring .gitignore is up to date..."
git add .gitignore

# Step 2: Clean up indexed but ignored files
echo "Cleaning up indexed but ignored files..."
git ls-files -i --exclude-standard | xargs -r git rm --cached

# Step 3: Show what would be removed
echo "The following files would be removed from the repository (but kept locally):"
git clean -Xdn

# Step 4: Ask for confirmation before removing non-indexed ignored files
echo "Do you want to remove these files? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
then
    git clean -Xdf
    echo "Ignored files removed successfully."
else
    echo "Operation canceled. No files were removed."
fi

# Step 5: Final notes
echo ""
echo "Note: This script removes files from the git repository but keeps them on your local disk."
echo "To complete the process, commit the changes:"
echo "git commit -m \"Remove files that should be ignored\""
echo ""