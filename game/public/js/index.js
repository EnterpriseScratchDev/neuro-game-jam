// Client-side JavaScript for interactions
const terminal = document.getElementById("terminal");
console.assert(terminal, "terminal element not found");
const input = document.getElementById("user-input");
console.assert(input, "user-input element not found");


const wsAddress = `ws://localhost:${window.location.port}`;
/** @type {WebSocket} */
let ws;

connectToWebSocket();

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        if (!ws) {
            console.debug("WebSocket not yet connected");
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

document.getElementById("input-container").addEventListener("click", (event) => {
    input.focus();
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
            terminal.innerHTML += `<div>&gt;&nbsp;${message.msg}</div>`;
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
        case "display-file":
            console.assert(typeof message.file === "object", "Expected message with \"display-file\" command to have an object property called \"file\"");
            handleDisplayFile(message.file);
            break;
        case "display-dir":
            console.assert(message.contents, "Expected message with \"display-dir\" command to have a property called \"contents\"");
            handleDisplayDirectory(message.contents);
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
    const newDiv = document.createElement("div");
    newDiv.innerText = message;
    terminal.appendChild(newDiv);
    scrollToBottom();
}

/**
 * Print a message to the terminal using the `[ERROR]` prefix.
 * @param {string} errorMessage
 */
function printError(errorMessage) {
    console.assert(typeof errorMessage === "string", `printError() expects a string argument`);
    const newDiv = document.createElement("div");
    newDiv.innerText = `[ERROR] ${errorMessage}`;
    terminal.appendChild(newDiv);
    scrollToBottom();
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

/**
 * @param {VFile} file
 */
function handleDisplayFile(file) {
    switch (file.contentType) {
        case "descriptive":
        case "text":
            // terminal.innerHTML += `<div class="terminal-card"><header>${file.name}</header><div>${file.content}</div></div>`
            const outerDiv = document.createElement("div");
            outerDiv.className = "terminal-card";
            const header = document.createElement("header");
            header.innerText = file.name;
            if (file.size) {
                header.innerText += ` (${file.size})`;
            }
            outerDiv.appendChild(header);
            const innerDiv = document.createElement("div");
            innerDiv.innerText = file.content;
            outerDiv.appendChild(innerDiv);
            terminal.appendChild(outerDiv);
            break;
        default:
            console.error(`Unrecognized file contentType \"${file.contentType}\"; rendering the file as plain text`);
            const newDiv = document.createElement("div");
            newDiv.innerText = file.content;
            terminal.appendChild(newDiv);
            break;
    }
    scrollToBottom();
}

/**
 * @param {VDirDisplayFormat[]} dirContents
 */
function handleDisplayDirectory(dirContents) {
    dirContents.sort((a, b) => a.name.localeCompare(b.name));
    const outerDiv = document.createElement("div");
    const table = document.createElement("table");

    const headerRow = document.createElement("tr");
    const nameHeader = document.createElement("th");
    nameHeader.innerText = "name";
    headerRow.appendChild(nameHeader);
    const typeHeader = document.createElement("th");
    typeHeader.innerText = "type";
    headerRow.appendChild(typeHeader);
    const sizeHeader = document.createElement("th");
    sizeHeader.innerText = "size";
    headerRow.appendChild(sizeHeader);
    table.appendChild(headerRow);

    for (const item of dirContents) {
        const row = document.createElement("tr");
        const nameColumn = document.createElement("td");
        nameColumn.innerText = item.name;
        row.appendChild(nameColumn);
        const typeColumn = document.createElement("td");
        typeColumn.innerText = item.type;
        row.appendChild(typeColumn);
        const sizeColumn = document.createElement("td");
        sizeColumn.innerText = item.size || "";
        row.appendChild(sizeColumn);
        table.appendChild(row);
    }
    outerDiv.appendChild(table);
    terminal.appendChild(outerDiv);
    scrollToBottom();
}

function scrollToBottom() {
    terminal.scrollTop = terminal.scrollHeight;
}


