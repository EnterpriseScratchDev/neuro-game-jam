#!/bin/bash
set -e
cd dist

# Delete existing executables and archives
echo Deleting existing executables and archives...
rm -f terminal-game-*

# Generate new executables
echo Generating new executables...
npm run pkg

# Package for Windows
echo Creating archive for Windows...
zip terminal-game-win.zip terminal-game-win.exe run_game.bat config.json

# Package for Linux
echo Creating archive for Linux...
zip terminal-game-linux.zip terminal-game-linux run_game.sh config.json

# Package for MacOS
echo Creating archive for MacOS...
zip terminal-game-macos.zip terminal-game-macos run_game.sh config.json
