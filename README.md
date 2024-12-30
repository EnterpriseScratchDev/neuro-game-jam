
## Running from Source

To run from source, you must have [Node.js](https://nodejs.org/en/download) installed.

1. Run `cd game`
2. Run `npm install` to install the necessary dependencies
3. Run `npm run start` to start the game
4. Edit `config.json` to avoid port conflicts, if necessary
5. Open the game's web page (`http://localhost:3000` by default)

If this program refuses to release port `3000`, it can be terminated by running `npx kill-port 3000`.
If you're using a different port, replace `3000` with that number.

## Running from a Packaged Executable

1. Download the `zip` archive for your operating system from the [releases page](https://github.com/EnterpriseScratchDev/neuro-game-jam/releases)
2. Extract the archive in a location of your choice
3. Locate the `run_game.bat` (Windows) or `run_game.sh` (Linux and macOS) script
4. There should be a `config.json` file in the same directory; it can be edited to change the port the server is running on
5. Double-click on the script to launch the game
   - If nothing happens, or the script is opened as a text file, try right-clicking it to see if there's an option to run it as a program
   - If this doesn't work either, the executable file can be run from a terminal by navigating to it using `cd` and running `terminal-game-windows.exe` (for Windows), `./terminal-game-linux` (for Linux), or `./terminal-game-macos` (for macOS)
6. Open `localhost:3000` in your web browser
   - If you changed the server port in `config.json`, use that port instead of `3000`
   - If you're confused about what page to open, look at the text being printed to the terminal. One of the first lines will look something like `Game running at http://localhost:3000`. Simply copy that URL into your web browser.

