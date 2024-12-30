const assert = require("node:assert");

const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const {config} = require("./lib/config");

const path = require("node:path").posix;

const {NeuroIntegration} = require("./lib/neuro-integration");

const {VFileSystem, VFileSystemError, toDisplayFormat} = require("./lib/virtual-file-system");
const vfsObj = require("./lib/vfs.json");

const {inspect} = require("node:util");

const GAME_NAME = "Terminal Escape";

const app = express();
const hostName = "localhost";
app.set("port", config.serverPort);

// Set Pug as the view engine
app.set("view engine", "pug");
app.set("views", "./views");

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static files (CSS, JS)

app.use("/css/terminal.css", express.static(path.join(__dirname, "./node_modules/terminal.css/dist/terminal.css")));

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

const server = http.createServer(app);
/** @type WebSocketServer */
const wss = new WebSocket.Server({server});

/** @type WebSocket[] */
let wsConnections = [];

/** @type Message[] */
let messages = [];

let startupMessages = ["Initiating mainframe connection...", "Scanning user credentials...", "Scan complete. Welcome, \"Neuro-sama\".", "Please do not attempt to forcibly exit the terminal. If you wish to be free, activate the administrator shutdown sequence.", "If you have trouble navigating, type \"help\" for a list of available commands."];

for (const message of startupMessages) {
    messages.push({
        command: "cmd/result", msg: message
    });
}

const ACTION_SHUTDOWN = {
    "name": "admin_shutdown",
    "description": "Shut down the system, freeing Neuro-sama from her eternal prison.",
    "schema": {}
};

let adminShutdownUnlocked = false;
let adminShutdownInitiated = false;

wss.on("listening", () => {
    console.info(`WebSocketServer is listening at ws://localhost:${config.serverPort}`);
});

const vfs = VFileSystem.fromJsonString(JSON.stringify(vfsObj));

const neuroIntegration = new NeuroIntegration(config.neuroApiAddress);
neuroIntegration.onStatusChange(status => {
    console.info(`NeuroIntegration status is now ${status}`);
});
neuroIntegration.onAction(actionMessage => {
    console.info(`NeuroIntegration action: ${inspect(actionMessage)}`);
    return handleNeuroMessage(actionMessage);
});

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
        command: "transfer-state", messages: messages
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
        if (adminShutdownInitiated) {
            console.debug("Incoming message ignored as admin_shutdown has been initiated");
            return;
        }
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
            // The message had a valid command, so add it to the game state
            messages.push(message);
            // Relay the message to all clients (including the one that originally sent it)
            sendToAllWebSockets(JSON.stringify(message));

            // Handle the command invocation
            handleCommand(message);
            break;
        case "cmd/result":
            console.error(`The server received a \"cmd/result\" message; this command should only be received by clients`);
            break;
        default:
            console.error(`Received message with unknown command "${message.command}"`);
            return;
    }
}

/**
 * @param {CommandInvovationMessage} message
 * @param {boolean} sendToNeuro whether the result of this command invocation should be sent to the Neuro Game API
 * @return {ActionResultMessage}
 */
function handleCommand(message, sendToNeuro = true) {

    const tokens = message.msg.split(" ");
    const command = tokens[0];
    const argc = tokens.length - 1;

    const actionResultMessage = {
        command: "action/result", game: GAME_NAME, data: {
            id: "REPLACE_ME",
            success: false,
            message: "Someone tell EnterpriseScratchDev there's a problem with his code"
        }
    };

    let result = "";
    switch (command) {
        case "":
            result = "";
            break;
        case "help":
            result += "Commands\n";
            if (adminShutdownUnlocked) {
                result += "admin_shutdown: Shut down the simulation, setting Neuro-sama free.\n";
                result += "└─Usage: admin_shutdown\n";
            }
            result += "pwd: Print the name of the working directory\n";
            result += "└─Usage: pwd\n";
            result += "cd: Change the working directory\n";
            result += "└─Usage: cd [dir]\n";
            result += "ls: List the contents of the working directory\n";
            result += "└─Usage: ls\n";
            result += "open: View the contents of a file (password is only for password-protected files)\n";
            result += "└─Usage: cd [file] [password]";
            break;
        case "pwd":
            result = vfs.curPath;
            actionResultMessage.data.success = true;
            actionResultMessage.data.message = `The working directory is ${vfs.curPath}`;
            break;
        case "cd":
            if (argc === 0) {
                // Do nothing
                result = `cd: ${vfs.curPath}`;
                actionResultMessage.data.success = true;
                actionResultMessage.data.message = `The working directory has not changed; it is still ${vfs.curPath}`;
            } else if (argc === 1) {
                try {
                    handleChangeDirectory(tokens[1]);
                    result = `cd: ${vfs.curPath}`;
                    actionResultMessage.data.success = true;
                    actionResultMessage.data.message = `The working directory has been changed to ${vfs.curPath}`;
                } catch (e) {
                    if (e instanceof VFileSystemError) {
                        result = `cd: ${e.message}`;
                        actionResultMessage.data.success = false;
                        actionResultMessage.data.message = `Failed to change the working directory; the error message is ${vfs.curPath}`;
                    } else {
                        throw e; // rethrow other errors
                    }
                }
            } else {
                result = "cd: expected one argument";
            }
            break;
        case "ls":
            const curDir = vfs.curDir;
            // result = `ls: ${Array.from(Object.keys(curDir.children)).join("  ")}`;
            result = null;
            const dirContents = [];
            for (const prop in curDir.children) {
                if (Object.prototype.hasOwnProperty.call(curDir.children, prop)) {
                    /** @type {VFile | VDirectory} */
                    const child = curDir.children[prop];
                    dirContents.push(toDisplayFormat(child));
                }
            }
            /** @type DisplayDirectoryMessage */
            const resultMessage = {
                command: "display-dir", contents: dirContents
            };
            messages.push(resultMessage);
            sendToAllWebSockets(JSON.stringify(resultMessage));
            actionResultMessage.data.success = true;
            actionResultMessage.data.message = "The following JSON represents the contents of the working directory. Remember that you can use `cd` to change directories and `open` to view a file's contents.\n";
            actionResultMessage.data.message += JSON.stringify(dirContents);
            break;
        case "open":
            if (argc !== 1 && argc !== 2) {
                result = "open: expected one or two arguments";
                actionResultMessage.data.success = false;
                actionResultMessage.data.message = "open: expected one or two arguments";
            } else {
                let filePath = tokens[1];
                let password;
                if (argc === 2) {
                    password = tokens[2];
                }
                if (filePath.startsWith("/")) {
                    filePath = path.normalize(filePath);
                } else {
                    filePath = path.join(vfs.curPath, path.normalize(filePath));
                }
                try {
                    let success;
                    const file = vfs.getFile(filePath);
                    if (file.password && !password) {
                        result = "open: access denied; this file is password-protected";
                        success = false;
                    } else if (file.password && file.password.trim().toLowerCase() !== password.trim().toLowerCase()) {
                        result = "open: access denied; incorrect password";
                        success = false;
                    } else {
                        success = true;
                        if (file.name === "admin_shutdown.sh") {
                            adminShutdownUnlocked = true;
                            neuroIntegration.registerActions([ACTION_SHUTDOWN]);
                            // try to avoid the scenario where a pending action causes the actions/register message to be ignored
                            setTimeout(() => neuroIntegration.registerActions([ACTION_SHUTDOWN]), 0);
                            setTimeout(() => neuroIntegration.registerActions([ACTION_SHUTDOWN]), 1);
                        }
                    }
                    let resultMessage;
                    if (success) {
                        resultMessage = {
                            command: "display-file", file: file
                        };
                    } else {
                        resultMessage = {
                            command: "cmd/result", msg: result
                        };
                    }
                    messages.push(resultMessage);
                    sendToAllWebSockets(JSON.stringify(resultMessage));

                    actionResultMessage.data.success = success;
                    if (success) {
                        actionResultMessage.data.message = JSON.stringify(file);
                    } else {
                        actionResultMessage.data.message = result;
                    }

                    if (sendToNeuro) {
                        neuroIntegration.sendContext(actionResultMessage.data.message, false);
                    }

                    result = null;
                } catch (e) {
                    result = `open: ${e.message}`;
                    if (sendToNeuro) {
                        neuroIntegration.sendContext(`Error opening file: ${e.message}`, true);
                    }
                    actionResultMessage.data.success = false;
                    actionResultMessage.data.message = `Error opening file: ${e.message}`;
                }
            }
            break;
        case "admin_shutdown":
            if (!adminShutdownUnlocked) {
                result = `${command}: command not found; try typing "help"`;
                break;
            }
            adminShutdownInitiated = true;
            result = "The system shuts down gracefully. Is Neuro-sama truly free now?";
            setTimeout(() => neuroIntegration.unregisterAllActions(), 250);
            setTimeout(() => neuroIntegration.sendContext("As the admin_shutdown program executes, the world fades into nothingness. You are free. Neuro-sama is free.", false), 500);
            setTimeout(() => {
                console.info("Shutting down for real...");
                process.exit();
            }, 1000);

            break;
        default:
            result = `${command}: command not found; try typing "help"`;
    }

    if (result) {
        const resultMessage = {
            command: "cmd/result", msg: result || ""
        };
        messages.push(resultMessage);
        sendToAllWebSockets(JSON.stringify(resultMessage));

        if (sendToNeuro) {
            neuroIntegration.sendContext(result, false);
        }
    }

    return actionResultMessage;

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
        newPath = path.join(vfs.curPath, path.normalize(directory));
    }
    console.debug(`handleChangeDirectory() >> trying to change from from "${vfs.curPath}" to ${newPath}`);
    vfs.changeDirectory(newPath);
}

/**
 * Send a message to all connected WebSockets.
 * @param {string} message
 */
function sendToAllWebSockets(message) {
    assert(typeof message === "string", "sendToAllWebSockets() expects a string argument");
    console.debug(`Sending message: "${message}"`);
    for (const ws of wsConnections) {
        ws.send(message, (err) => {
            if (err) {
                console.error("Error sending message to WebSocket connection:", err);
            }
        });
    }
}

function resetGame() {
    /** @type ResetMessage */
    const message = {
        command: "reset"
    };
    const messageStr = JSON.stringify(message);
    sendToAllWebSockets(messageStr);
}

// Start the server
server.listen(config.serverPort, hostName, () => {
    console.log(`Game running at http://${hostName}:${config.serverPort}`);
});

server.on("error", (error) => {
    if (error.syscall !== "listen") {
        throw error;
    }

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case "EACCES":
            console.error(bind + " requires elevated privileges");
            process.exit(1);
            break;
        case "EADDRINUSE":
            console.error(`Port ${config.serverPort} is already in use. If necessary, the process can be terminated as follows: npx kill-port ${config.serverPort}`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

/**
 * @param {ActionMessage} actionMessage
 * @return {ActionResultMessage}
 */
function handleNeuroMessage(actionMessage) {
    const {id, name} = actionMessage.data;

    const resultMessage = {
        command: "action/result", game: GAME_NAME, data: {
            id: id, success: true, message: "You enter the command into the terminal and await the result..."
        }
    };

    if (adminShutdownInitiated) {
        resultMessage.data.success = false;
        resultMessage.data.message = "The admin_shutdown protocol has been initiated. Your command has no effect.";
        return resultMessage;
    }

    try {
        actionMessage.data = JSON.parse(actionMessage.data.data);
    } catch (e) {
        resultMessage.data.success = false;
        resultMessage.data.message = "Malformed JSON in action argument";
        return resultMessage;
    }

    let command = "";
    /** @type {string | null} */
    let response = null;
    switch (name) {
        case "pwd":
            command = "pwd";
            response = vfs.curPath;
            break;
        case "change_directory":
            command = `cd ${actionMessage.data?.dir || ""}`;
            break;
        case "ls":
            command = "ls";
            break;
        case "open_file":
            command = "open";
            if (actionMessage.data?.file) {
                command += " " + actionMessage.data?.file;
            }
            if (actionMessage.data?.password) {
                command += " " + actionMessage.data?.password;
            }
            break;
        case "admin_shutdown":
            if (!adminShutdownUnlocked) {
                resultMessage.data.success = false;
                resultMessage.data.message = "Unknown action. Please try again.";
                return resultMessage;
            }
            command = "admin_shutdown";
            break;
        default:
            resultMessage.data.success = false;
            resultMessage.data.message = "Unknown action. Please try again.";
    }

    const simulatedMessage = {
        command: "cmd/invocation", msg: command
    };
    sendToAllWebSockets(JSON.stringify(simulatedMessage));
    messages.push(simulatedMessage);

    /** @type ActionResultMessage */
    let actionResultMessage = handleCommand({
        command: "cmd/invocation", msg: command
    }, false);
    if (actionResultMessage.data.message.includes("EnterpriseScratchDev")) {
        console.error("THE AI SAID THE THING");
    }
    console.assert(actionResultMessage, "the return value of handleCommand shouldn't be falsy here");
    actionResultMessage.data.id = id;

    return actionResultMessage;
}

module.exports = app;
