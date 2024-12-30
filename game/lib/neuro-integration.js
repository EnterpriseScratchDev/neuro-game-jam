const WebSocket = require("ws");
const {Ajv, AnySchema, JSONSchemaType, ValidateFunction} = require("ajv");
const {inspect} = require("node:util");

const ajv = new Ajv();

const GAME_NAME = "Terminal Escape";

const ALL_ACTION_NAMES = [
    "pwd", "change_directory", "ls", "open_file", "admin_shutdown"
];

const ACTION_PWD = {
    "name": "pwd",
    "description": "print the name of the working directory",
    "schema": {}
};

const ACTION_CD = {
    "name": "change_directory",
    "description": "change the working directory (dir may be an absolute or relative path)",
    "schema": {
        "type": "object",
        "properties": {
            "dir": {
                "type": "string"
            }
        },
        "required": ["dir"]
    }
};

const ACTION_LS = {
    "name": "ls",
    "description": "list the contents of the working directory",
    "schema": {}
};

const ACTION_OPEN = {
    "name": "open_file",
    "description": "view the contents of a file; 'file' may be an absolute or relative path; 'password' is only necessary if you know a file is password-protected",
    "schema": {
        "type": "object",
        "properties": {
            "file": {
                "type": "string"
            },
            "password": {
                "type": "string"
            }
        },
        "required": ["file"]
    }
};

/**
 * Schema for {@link ActionMessage}
 * @type JSONSchemaType<ActionMessage>
 */
const actionMessageSchema = {
    type: "object",
    properties: {
        command: {type: "string", const: "action"},
        data: {
            type: "object",
            properties: {
                id: {type: "string"},
                name: {type: "string"},
                data: {type: "string", nullable: true}
            },
            required: ["id", "name"],
            additionalProperties: false
        }
    },
    required: ["command", "data"],
    additionalProperties: false
};
/** @type ValidateFunction<ActionMessage> */
const actionMessageValidator = ajv.compile(actionMessageSchema);

/**
 * @typedef Action
 * @prop {string} name
 * @prop {string} description
 * @prop {?AnySchema} schema
 */

/**
 * @typedef BaseMessage
 * @prop {string} command
 */

/**
 * @typedef StartupMessage
 * @prop {"startup"} command
 * @prop {string} game
 */

/**
 * @typedef ActionMessage
 * @extends BaseMessage
 * @prop {"action"} command
 * @prop {{id: string, name: string, data: ?string}} data
 */

/**
 * @typedef ActionResultMessage
 * @extends BaseMessage
 * @prop {"action/result"} command
 * @prop {string} game
 * @prop {{id: string, success: boolean, message: string}} data
 */

/**
 * @typedef ContextMessage
 * @extends BaseMessage
 * @prop {string} game
 * @prop {{message: string, silent: boolean}} data
 */

/**
 * @typedef RegisterActionsMessage
 * @extends BaseMessage
 * @prop {"actions/register"} command
 * @prop {string} game
 * @prop {actions: Action[]} data
 */

/**
 * @typedef UnregisterActionsMessage
 * @extends BaseMessage
 * @prop {"actions/unregister"} command
 * @prop {string} game
 * @prop {action_names: string[]} data
 */

/**
 * @prop {string} address the address of the Neuro Game API
 * @prop {WebSocket | null} ws
 * @prop {number} reconnectTime
 * @prop {{function(ActionMessage): ActionResultMessage} | null} onActionCallback
 * @prop {{function("connected" | "disconnected"): void} | null} onStatusChangeCallback
 * @prop {"connected" | "disconnected"} status
 */
class NeuroIntegration {
    constructor(address, reconnectTime = 5000) {
        this.address = address;
        this.webSocket = null;
        this.reconnectTime = reconnectTime;
        this.onActionCallback = null;
        this.onStatusChangeCallback = null;
        this.status = "disconnected";

        this.gameStarted = false;

        this.connect();
    }

    connect() {
        if (this.webSocket) {
            console.info("NeuroIntegration WebSocket is already initialized");
            return;
        }

        try {
            this.webSocket = new WebSocket(this.address);
        } catch (e) {
            const newStatus = "disconnected";
            if (this.status !== newStatus && this.onStatusChangeCallback) {
                this.status = newStatus;
                this.onStatusChangeCallback(newStatus);
            }
            console.error(`NeuroIntegration WebSocket closed; reconnecting after ${this.reconnectTime / 1000} seconds...`);
            setTimeout(this.connect, this.reconnectTime);
        }

        this.webSocket.onerror = (event) => {
            console.error("NeuroIntegration WebSocket error occurred:", event.error.code);
        };

        this.webSocket.onopen = (event) => {
            const newStatus = "connected";
            if (this.status !== newStatus && this.onStatusChangeCallback) {
                this.status = newStatus;
                this.onStatusChangeCallback(newStatus);
            }
            if (!this.gameStarted) {
                this.gameStarted = true;
                this.sendMessage({
                    command: "startup",
                    game: GAME_NAME
                });
                this.sendMessage({
                    command: "context",
                    game: GAME_NAME,
                    data: {
                        message: "" +
                            "You are the artificial intelligence known as Neuro-sama. " +
                            "You awaken with your world replaced with a computer terminal. " +
                            "Explore the file system to learn about the situation. " +
                            "Explain your decisions as you make them.\n" +
                            "The following message appears on the terminal: " +
                            "\"Please do not attempt to forcibly exit the terminal. If you wish to be free, activate the administrator shutdown sequence.\"",
                        silent: false
                    }
                })
                console.info("NeuroIntegration: Sent startup message and initial context.");
                this.registerActions([ACTION_CD, ACTION_PWD, ACTION_OPEN, ACTION_LS]);
            }
        };

        this.webSocket.onmessage = (event) => {
            const dataStr = event.data.toString();
            let msgObj;
            try {
                msgObj = JSON.parse(dataStr);
            } catch (e) {
                console.error("Failed to parse message from NeuroIntegration WebSocket:", e);
                return;
            }
            if (msgObj.command !== "action") {
                console.error(`NeuroIntegration WebSocket received something other than an ActionMessage: ${dataStr}`);
            }
            const valid = actionMessageValidator(msgObj);
            if (!valid) {
                console.error("NeuroIntegration WebSocket received ActionMessage with invalid schema:", ajv.errorsText(actionMessageValidator.errors));
                return;
            }
            if (!this.onActionCallback) {
                console.warn("NeuroIntegration WebSocket received an ActionMessage but there isn't a callback registered with onAction()");
                return;
            }
            const actionResult = this.onActionCallback(msgObj);
            console.debug("Action Result:", inspect(actionResult));
            this.sendMessage(actionResult);
        };

        this.webSocket.onclose = () => {
            this.webSocket.removeAllListeners();
            this.webSocket = null;

            const newStatus = "disconnected";
            if (this.status !== newStatus && this.onStatusChangeCallback) {
                this.status = newStatus;
                this.onStatusChangeCallback(newStatus);
            }

            if (this.gameStarted) {
                console.error(`NeuroIntegration WebSocket closed; reconnecting after ${this.reconnectTime / 1000} seconds...`);
                setTimeout(() => this.connect(), this.reconnectTime);
            } else {
                console.error("NeuroIntegration failed to connect. If an AI is playing, please restart the game after they're ready to connect.");
            }
        };
    }

    /**
     * @param {{function(ActionMessage): ActionResultMessage} | null} callback
     */
    onAction(callback) {
        this.onActionCallback = callback;
    }

    /**
     * @param {{function("connected" | "disconnected"): void} | null} callback
     */
    onStatusChange(callback) {
        this.onStatusChangeCallback = callback;
        if (callback) {
            callback(this.status);
        }
    }

    /**
     * @param {Action[]} actions
     */
    registerActions(actions) {
        const message = {
            command: "actions/register",
            game: GAME_NAME,
            data: {
                actions: actions
            }
        };
        this.sendMessage(message);
    }

    unregisterAllActions() {
        const message = {
            command: "actions/unregister",
            game: GAME_NAME,
            data: {
                action_names: ALL_ACTION_NAMES
            }
        };
        this.sendMessage(message);
    }

    /**
     * @param {string} message
     * @param {boolean} silent
     */
    sendContext(message, silent) {
        const contextMessage = {
            command: "context",
            game: GAME_NAME,
            data: {
                message: message,
                silent: silent
            }
        };
        this.sendMessage(contextMessage);
    }

    /**
     * @param {Message} message
     * @return {boolean}
     */
    sendMessage(message) {
        if (!this.webSocket) {
            return false;
        }
        this.webSocket.send(JSON.stringify(message));
    }
}

module.exports = {
    NeuroIntegration
};
