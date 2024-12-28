// Client-side JavaScript for interactions
const terminal = document.getElementById('terminal');
console.assert(terminal, "terminal element not found");
const input = document.getElementById('user-input');
console.assert(input, "user-input element not found");

const wsAddress = 'ws://localhost:3001';
/** @type {WebSocket} */
let ws;

connectToWebSocket();

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        if (!ws) {
            console.debug("WebSocket not yet connected")
            return;
        }

        console.debug(event);
        const command = input.value;
        input.value = "";

        ws.send(JSON.stringify({
            command: "cmd/invocation",
            msg: command
        }), (err) => {
            printError(`WebSocket error: ${err}`);
            console.error("WebSocket error when sending message", err);
        });
    }
});

terminal.addEventListener("click", (event) => {
    console.debug("moving focus back to the user-input element");
});

function connectToWebSocket() {
    try {
        ws = new WebSocket(wsAddress);
    } catch (e) {
        console.info("WebSocket connection failed, will attempt to connect again in a moment...");
        setTimeout(connectToWebSocket, 5000);
        return;
    }

    /**
     * @callback
     * @param {WebSocket.Event} event
     */
    ws.onopen = (event) => {
        console.info(`WebSocket connected to ${event.target.url}`);
    };

    /**
     * @callback
     * @param {WebSocket.CloseEvent} event
     */
    ws.onclose = (event) => {
        ws = null;
        console.info("WebSocket closed, will attempt to reconnect in a moment...");
        setTimeout(connectToWebSocket, 5000);
    };

    /**
     * @callback
     * @param {WebSocket.ErrorEvent} event
     */
    ws.onerror = (event) => {
        // Don't double-log failed connection errors
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            console.error("WebSocket error:", event);
        }
    };

    /**
     * @callback
     * @param {WebSocket.MessageEvent} event
     */
    ws.onmessage = (event) => {
        console.debug("MessageEvent from WebSocket:", event);
        const data = event.data;
        console.debug(`typeof event.data is "${typeof event.data}"`);
        /** @type Message */
        let message;
        try {
            if (typeof data === "string") {
                message = JSON.parse(data);
            } else {
                console.warn(`Received a WebSocket message with data type "${typeof data}"; This code expects string data, so this may cause problems`);
                message = JSON.parse(data.toString());
            }
        } catch (e) {
            console.error("Error parsing WebSocket message to JSON:", e);
            return;
        }
        console.assert(typeof message === "object", "Expected message to be a JSON object");
        console.assert(typeof message.command === "string", "Expected message to have a string property called \"command\"");
        handleMessage(message);
    };
}

/**
 * @param {Message} message
 * @return {void}
 */
function handleMessage(message) {
    const command = message.command;
    switch (command) {
        case "cmd/invocation":
            console.assert(typeof message.msg === "string", "Expected message with \"cmd/invocation\" command to have a string property called \"msg\"");
            terminal.innerHTML += `<div>&gt;&nbsp;${message.msg}</div>`
            break;
        case "cmd/result":
            console.assert(typeof message.msg === "string", "Expected message with \"cmd/result\" command to have a string property called \"msg\"");
            printMessage(message.msg);
            break;
        case "reset":
            console.info("Terminal reset to initial state");
            terminal.innerHTML = "<div>Initiating session...</div>";
            break;
        case "transfer-state":
            terminal.innerHTML = "";
            transferStateFromServer(message);
            break;
        default:
            console.error(`Unrecognized command "${command}"`);
            break;
    }
}

/**
 * Print a message to the terminal.
 * @param {string} message
 */
function printMessage(message) {
    console.assert(typeof message === "string", `printMessage() expects a string argument`);
    terminal.innerHTML += `<div>${message}</div>`
}

/**
 * Print a message to the terminal using the `[ERROR]` prefix.
 * @param {string} errorMessage
 */
function printError(errorMessage) {
    console.assert(typeof errorMessage === "string", `printError() expects a string argument`);
    terminal.innerHTML += `<div>[ERROR] ${errorMessage}</div>`
}

/**
 * @param {TransferStateMessage} transferStateMessage
 */
function transferStateFromServer(transferStateMessage) {
    console.assert(transferStateMessage?.messages, "Received a \"transfer-state\" message with no messages to replay");
    for (const message of transferStateMessage.messages) {
        console.assert(message.command !== "transfer-state", "A \"transfer-state\" message cannot contain an additional \"transfer-state\" message");
        handleMessage(message);
    }
}