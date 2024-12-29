const fs = require("fs");
const path = require("path");

/**
 * @typedef GameConfig
 * @prop {number} serverPort the port that the HTML is served on and that the websocket server listens on
 * @prop {number} neuroApiPort the port that the Neuro Game API is listening on
 */

/** @type GameConfig */
const defaultConfig = {
    serverPort: 3000, neuroApiPort: 8000
};

const configPath = path.resolve(process.cwd(), "config.json");

if (!fs.existsSync(configPath)) {
    console.info(`Config file not found. Creating a default config at ${configPath}`);
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
}

let userConfig = {};
try {
    userConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.info(`Loaded config from file ${configPath}`);
} catch (e) {
    console.info(`Failed to load config from the file ${configPath}:`, e);
}
/** @type GameConfig */
const config = {...defaultConfig, ...userConfig};

module.exports = {config};

