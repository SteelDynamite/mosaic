#!/bin/bash
uuid="mosaic@mawitime"

# Compile TypeScript to JavaScript
echo "Compiling TypeScript..."
npm run build

# Copy compiled files to extension directory
echo "Copying compiled files..."
cp dist/*.js extension/

./export-zip.sh # Export to zip
gnome-extensions install --force "$uuid.zip" # Install using gnome-extensions
rm "$uuid.zip"