#!/bin/bash
set -e

# Delete existing executables and archives
echo Deleting existing executables and archives...
rm dist/terminal-game-*

# Generate new executables
echo Generating new executables...
npm run pkg

# Package for Windows
echo Creating archive for Windows...
zip dist/terminal-game-win.zip dist/terminal-game-win.exe dist/run_game.bat dist/config.json

# Package for Linux
echo Creating archive for Linux...
zip dist/terminal-game-linux.zip dist/terminal-game-linux dist/run_game.sh dist/config.json

# Package for MacOS
echo Creating archive for MacOS...
zip dist/terminal-game-macos.zip dist/terminal-game-macos dist/run_game.sh dist/config.json
