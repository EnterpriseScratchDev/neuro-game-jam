const assert = require("node:assert");

const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const app = express();
const hostName = "localhost";
const port = 3001;

const path = require('node:path');

// Set Pug as the view engine
app.set("view engine", "pug");
app.set("views", "./views");

// Middleware
app.use(bodyParser.json());
app.use(express.static("public")); // Serve static files (CSS, JS)

app.use("/css/terminal.css", express.static("./node_modules/terminal.css/dist/terminal.css"));

// Routes
app.get("/", (req, res) => {
    res.render("index", {username: "Player1"});
});

const server = http.createServer(app);
/** @type WebSocketServer */
const wss = new WebSocket.Server({server}, () => {
    console.log("WSS callback");
});

/** @type WebSocket[] */
let wsConnections = [];

/** @type Message[] */
let messages = [];
messages.push({
    command: "cmd/result",
    msg: "Initiating mainframe connection..."
});
messages.push({
    command: "cmd/result",
    msg: "Connection established."
});

wss.on("listening", () => {
    console.info("WebSocketServer is listening");
});

path.sep = "/";
let curPath = path.normalize("/");



/**
 * @callback
 * @param {WebSocket} ws
 */
wss.on("connection", (ws) => {
    assert(ws instanceof WebSocket);
    wsConnections.push(ws);
    console.info(`New WebSocket connection; there are now ${wsConnections.length} connections`);

    // Transfer the current state to the client
    const transferStateMessage = JSON.stringify({
        command: "transfer-state",
        messages: messages
    });
    console.debug("About to transfer state to a new client:", transferStateMessage);
    ws.send(transferStateMessage, (err) => {
        if (err) {
            console.error("Error sending state to client:", err);
        }
    });

    ws.on("close", (code, reason) => {
        wsConnections = wsConnections.filter((x) => x !== ws);
        console.info(`WebSocket connection closed; code: ${code}, reason: "${reason}"; there are now ${wsConnections.length} connections`);
    });

    ws.on("error", (error) => {
        console.error("WebSocket error", error);
    });

    ws.on("message", async (data, isBinary) => {
        if (isBinary) {
            console.error("WebSocket received a message with binary data");
            return;
        }
        const dataStr = data.toString();
        console.debug("Message from WebSocket:", dataStr);
        let dataObj;
        try {
            dataObj = JSON.parse(dataStr);
        } catch (e) {
            console.error("Error parsing message from WebSocket:", e);
            return;
        }
        if (typeof dataObj?.command !== "string") {
            console.error("Received message from WebSocket that doesn't have the command string property");
            return;
        }
        try {
            await handleMessage(dataObj);
        } catch (e) {
            console.error("Error thrown from handleMessage:", e);
            return;
        }
        console.debug("Successfully handled a message from a WebSocket");
    });
});

/** @param {Message} message */
async function handleMessage(message) {
    console.assert(typeof message?.command == "string", "handleMessage() expects its argument to have a command");

    switch (message.command) {
        case "cmd/invocation":
            // Relay the message to all clients (including the one that originally sent it)
            sendToAllWebSockets(JSON.stringify(message));

            // Handle the command invocation
            handleCommand(message);
            break;
        case "cmd/result":
            console.error(`The server received a \"cmd/result\" message; this command should only be received by clients`);
            break;
        default:
            console.error(`Received message with unknown command "${message.command}"`)
            return;
    }

    // The message had a valid command, so add it to the game state
    messages.push(message);
}

/** @param {CommandInvovationMessage} message */
function handleCommand(message) {

    // /** @type CommandResultMessage */
    // const placeholderCmdResult = {
    //     command: "cmd/result",
    //     msg: "PLACEHOLDER CMD RESULT MESSAGE"
    // };
    // sendToAllWebSockets(JSON.stringify(placeholderCmdResult));

    const tokens = message.msg.split(" ");
    const command = tokens[0];
    const argc = tokens.length - 1;

    let result;
    switch (command) {
        case "":
            result = "";
            break;
        case "help":
            // TODO: help command
            result = "help is not yet implemented"
            break;
        case "pwd":
            result = curPath;
            break;
        case "cd":
            if (argc === 0) {
                // Do nothing
                result = `cd: ${curPath}`;
            } else if (argc === 1) {
                handleChangeDirectory(tokens[1]);
                result = `cd: ${curPath}`;
            } else {
                result = "cd: expected one argument";
            }
            break;
        default:
            result = `${command}: command not found`;
    }

    sendToAllWebSockets(JSON.stringify({
        command: "cmd/result",
        msg: result || ""
    }));
}

/**
 * Loosely follows the POSIX implementation of `cd`: {@link https://man7.org/linux/man-pages/man1/cd.1p.html}
 *
 * @param {?string} directory
 */
function handleChangeDirectory(directory) {
    if (!directory || directory === "") {
        return;
    }
    let newPath;
    assert(typeof directory === "string", `handleChangeDirectory() expects a string argument, actual argument was type "${typeof directory}"`);
    if (directory.startsWith("/")) {
        newPath = path.normalize(directory);
    } else {
        newPath = path.join(curPath, path.normalize(directory));
    }
    console.debug(`handleChangeDirectory() >> trying to change from from "${curPath}" to ${newPath}`);
}

/**
 *
 * @param {string} newPath
 */
function changeDirectory(newPath) {

}

/**
 * Send a message to all connected WebSockets.
 * @param {string} message
 */
function sendToAllWebSockets(message) {
    assert(typeof message === "string", "sendToAllWebSockets() expects a string argument")
    console.debug(`Sending message: "${message}"`);
    for (const ws of wsConnections) {
        ws.send(message, (err) => {
            if (err) {
                console.error("Error sending message to WebSocket connection:", err);
            }
        })
    }
}

function initGame() {
    resetGame();
}

function resetGame() {
    /** @type ResetMessage */
    const message = {
        command: "reset"
    }
    const messageStr = JSON.stringify(message);
    sendToAllWebSockets(messageStr);
}

app.post("/command", (req, res) => {
    const {command} = req.body;
    let response;

    switch (command.toLowerCase()) {
        case "look":
            response = "You see a dark forest surrounding you.";
            break;
        case "help":
            response = "Available commands: look, help, quit";
            break;
        case "quit":
            response = "Goodbye!";
            break;
        default:
            response = "Unknown command.";
    }

    res.send(response);
});

// Start the server
server.listen(port, hostName, () => {
    console.log(`Game running at http://${hostName}:${port}`);
});

module.exports = app;
