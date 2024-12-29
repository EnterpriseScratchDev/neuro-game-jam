// fs is only used to load the VFS JSON Schema
const fs = require("node:fs");
const _path = require("path").posix;
const {Ajv, ValidateFunction} = require("ajv");

/** @type Ajv */
const ajv = new Ajv();
/** @type {ValidateFunction<VDirectory> | null} */
let vfsValidator = null;
try {
    const vfsSchemaStr = fs.readFileSync("./lib/vfs-schema.json").toString();
    const vfsSchemaObj = JSON.parse(vfsSchemaStr);
    vfsValidator = ajv.compile(vfsSchemaObj);
} catch (e) {
    console.error("Failed to set up validator for Virtual File System JSON Schema", e);
}

/**
 * A file in a virtual file system.
 * @prop {string} name the name of this file; includes the extension, if there is one; should not contain `/` characters
 * @prop {"file"} type discriminator for files and directories
 * @prop {"text" | "descriptive" | "html"} contentType the type of data this file holds; a `"text"` file can be directly displayed to the terminal;
 *                                                     `"descriptive"` files are displayed via a pre-written description;
 *                                                     `"html"` files should have their content rendered as html
 * @prop {string} content the content of this file
 * @prop {string} size a string representation of the size of a file, such as `"6.1 KB"` or `"1.5 GB"`; this can be calculated automatically for `"text"` files
 * @see newTextFile
 * @see newDescriptiveFile
 */
class VFile {
    constructor(name) {
        console.assert(typeof name === "string", "name must be a string");
        console.assert(!name.includes("/"), "name must not contain \"/\" characters");
        this.name = name;
        this.type = "file";
    }

    /**
     * Create a new virtual text file.
     * @param name the name of the file
     * @param content the text contents of the file
     * @returns {VFile} the newly created file
     */
    static newTextFile(name, content) {
        const file = new VFile(name);
        file.contentType = "text";
        console.assert(content && typeof content === "string", "content must be a string");
        file.content = content;
        file.size = displaySize(content.length); // assuming 1 character is 1 byte
        return file;
    }

    /**
     * Create a new virtual descriptive file.
     * @param name the name of the file
     * @param description a plaintext description of what this file contains
     * @param size a string representation of the size of this file such as `"6.1 KB"` or `"1.5 GB"`
     * @returns {VFile}
     */
    static newDescriptiveFile(name, description, size) {
        const file = new VFile(name);
        file.contentType = "descriptive";
        console.assert(description && typeof description === "string", "description must be a string");
        file.content = description;
        file.size = size || ""; // fallback to an empty string for size
        return file;
    }
}

/**
 * Convert a number of bytes into a human-readable string representation.
 * @param {number} numBytes the number of bytes to convert.
 * @return {string} a string representation of the size with at most 2 digits after the decimal point.
 */
function displaySize(numBytes) {
    if (typeof numBytes !== "number" || isNaN(numBytes) || numBytes < 0) {
        throw new Error("Input must be a non-negative number.");
    }
    const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    let index = 0;
    while (numBytes >= 1024 && index < units.length - 1) {
        numBytes /= 1024;
        index++;
    }
    return `${numBytes.toFixed(2)} ${units[index]}`;
}

/**
 * A directory in a virtual file system.
 * @prop {string} name the name of this directory; should only be empty for the root directory
 * @prop {"directory"} type discriminator for files and directories
 * @prop {Record<string, VFile | VDirectory>} children
 */
class VDirectory {
    constructor(name) {
        console.assert(typeof name === "string", "name must be a string");
        console.assert(!name.includes("/"), "name must not contain \"/\" characters");
        this.name = name;
        this.type = "directory";
        this.children = {};
    }
}

/**
 * Get a child (a file or directory) of a directory by name.
 * @param dir the directory
 * @param name the name of the child
 * @return {VFile | VDirectory | null} the child or `null` if none exists
 */
function getChild(dir, name) {
    if (!dir.children) {
        console.warn(`Virtual directory with name "${this.name}" has an uninitialized "children" property`);
        return null;
    }
    return dir.children[name] || null;
}

/**
 * A virtual file system.
 * @prop {VDirectory} rootDir the root directory; expected to have an empty name
 * @prop {string} curPath the path pointing to the user's current directory; should never be empty; the root directory is `"/"`
 * @prop {VDirectory} curDir the user's current directory; should never be `undefined` or `null`
 */
class VFileSystem {
    constructor(rootDir) {
        this.curPath = "/";
        if (rootDir) {
            this.rootDir = rootDir;
        } else {
            this.rootDir = new VDirectory("");
        }
        this.curDir = rootDir;
    }

    /**
     * Change directories with the virtual file system.
     * @param {string} newPath the absolute path to change to
     */
    changeDirectory(newPath) {
        console.assert(typeof newPath === "string" && newPath.length > 0, `changeDirectory expects a non-empty string argument, actual argument was type "${typeof newPath}`);
        console.assert(newPath.at(0) === "/", "changeDirectory expects an absolute path argument");
        if (newPath === "/") {
            this.curPath = "/";
            this.curDir = this.rootDir;
            return;
        }
        const components = newPath.split("/").slice(1); // skip the root directory
        let curDir = this.rootDir;
        let partialPath = ""; // for troubleshooting and error messages
        for (const component of components) {
            console.assert(curDir, "curDir should never be falsy");
            partialPath += "/" + component;
            const child = getChild(curDir, component);
            if (!child) {
                throw new VFileSystemError(`The directory "${newPath}" does not exist; "${partialPath}" does not exist`);
            } else if (child.type === "file") {
                throw new VFileSystemError(`The directory "${newPath}" does not exist; "${partialPath}" is a file, not a directory`);
            } else {
                curDir = child;
            }
        }
        this.curPath = newPath;
        this.curDir = curDir;
    }

    /**
     * Retrieve a directory object given a path.
     * @param {string} path the absolute path to retrieve a directory at
     * @return {VDirectory}
     * @throws {VFileSystemError} if the provided path doesn't exist or doesn't point to a directory
     */
    getDir(path) {
        console.assert(typeof path === "string" && path.length > 0, `getDir expects a non-empty string argument, actual argument was type "${typeof path}`);
        console.assert(path.at(0) === "/", "getDir expects an absolute path argument");
        if (path === "/") {
            return this.rootDir;
        }
        path = _path.normalize(path);
        const components = path.split("/").slice(1); // skip the root directory
        let curDir = this.rootDir;
        let partialPath = ""; // for troubleshooting and error messages
        for (const component of components) {
            console.assert(curDir, "curDir should never be falsy");
            partialPath += "/" + component;
            const child = getChild(curDir, component);
            if (!child) {
                throw new VFileSystemError(`The directory "${path}" does not exist; "${partialPath}" does not exist`);
            } else if (child.type === "file") {
                throw new VFileSystemError(`The directory "${path}" does not exist; "${partialPath}" is a file, not a directory`);
            } else {
                curDir = child;
            }
        }
        return curDir;
    }

    /**
     * Retrieve a file object given a path.
     * @param path the absolute path to retrieve a file at
     * @return {VFile}
     * @throws {VFileSystemError} if the provided path doesn't exist or doesn't point to a directory
     */
    getFile(path) {
        console.assert(typeof path === "string" && path.length > 0, `getFile expects a non-empty string argument, actual argument was type "${typeof path}`);
        console.assert(path.at(0) === "/", "getFile expects an absolute path argument");
        const parsedPath = _path.parse(path);
        const dirPath = parsedPath.dir;
        const dir = this.getDir(dirPath); // will throw if dirPath doesn't exist or isn't a directory
        const fileName = `${parsedPath.name}${parsedPath.ext}`;
        const child = getChild(dir, fileName);
        if (!child) {
            throw new VFileSystemError(`The file "${fileName}" does not exist in the directory "${dirPath}"`);
        } else if (child.type === "directory") {
            throw new VFileSystemError(`The path "${fileName}" points to a directory, not a file"`);
        } else {
            return child;
        }
    }

    /**
     *
     * @param {string} json a JSON string representing the root directory of a virtual file system
     * @return {VFileSystem | null} the newly created virtual file system or `null` if it couldn't be loaded
     */
    static fromJsonString(json) {
        try {
            const obj = JSON.parse(json);
            if (vfsValidator) {
                const valid = vfsValidator(obj);
                if (!valid) {
                    console.error(`Error validating Virtual File System JSON: ${ajv.errorsText(vfsValidator.errors)}`);
                    return null;
                }
            } else {
                console.warn("Virtual File System validator is not set up, so the loaded JSON will not be validated");
            }
            return new VFileSystem(obj);
        } catch (e) {
            console.error("Failed to parse VFS from string", e);
            return null;
        }
    }
}

class VFileSystemError extends Error {
    constructor(message) {
        super(message);
        this.name = "VFileSystemError";
    }
}

module.exports = {
    VFile, VDirectory, VFileSystem, VFileSystemError
};