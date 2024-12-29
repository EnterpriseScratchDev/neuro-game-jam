/**
 * @typedef BaseMessage
 * @property {string} command the type discriminator for Message objects
 */

/**
 * @typedef Message
 * @type {ResetMessage | CommandInvovationMessage | CommandResultMessage | TransferStateMessage}
 */

/**
 * Upon receiving this message, the server and all clients should reset the game to its initial state.
 * The server should relay this message to all clients.
 *
 * @typedef ResetMessage
 * @extends BaseMessage
 * @property {"reset"} command
 */

/**
 * This message communicates an invocation of a command on the terminal.
 * The server should relay this message to all clients, including the client that originally sent it.
 *
 * @typedef CommandInvovationMessage
 * @extends BaseMessage
 * @property {"cmd/invocation"} command
 * @property {string} msg the line of text submitted to the terminal (not including the `>` prefix)
 */

/**
 * This message communicates the result of a command invocation on the terminal.
 * The server should send this message to all clients.
 * Clients shouldn't ever send this message to the server.
 *
 * @typedef CommandResultMessage
 * @extends BaseMessage
 * @property {"cmd/result"} command
 * @property {string} msg the line(s) of text to be printed on the terminal
 */

/**
 * Transfer the terminal state from the server to a client.
 * The client should clear the terminal then process each of the included messages sequentially.
 *
 * @typedef TransferStateMessage
 * @extends BaseMessage
 * @property {"transfer-state"} command
 * @property {Message[]} messages
 */

/**
 * TODO: Handle text entry
 * @typedef TextEntryMessage
 * @extends BaseMessage
 * @property {"text-entry"} command
 * @property {?string} prompt
 * @property {?string} content
 */

/**
 * @typedef DisplayFileMessage
 * @extends BaseMessage
 * @property {"display-file"} command
 * @property {VFile} file the file to display
 */
