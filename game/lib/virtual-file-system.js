/**
 * A file in a virtual file system.
 * @prop {string} name the name of this file; includes the extension, if there is one; should not contain `/` characters
 * @prop {"text"} type the type of data this file holds; will probably always be text
 * @prop {?string} textContent the text contained in this file; only present if `type` is `"text"`
 */
class VFile {
    constructor(name) {
        console.assert(typeof name === "string", "name must be a string");
        console.assert(!name.includes("/"), "name must not contain \"/\" characters");
        this.name = name;
    }
}

/**
 * A directory in a virtual file system.
 * @prop {string} name the name of this directory; should only be empty for the root directory
 * @prop {Map<string, VDirectory>} directories subdirectories of this directory, keyed by `name`
 * @prop {Map<string, VFile>} files files within this directory, keyed by `name`
 */
class VDirectory {
    constructor(name) {
        console.assert(typeof name === "string", "name must be a string");
        console.assert(!name.includes("/"), "name must not contain \"/\" characters");
        this.name = name;
        this.directories = new Map();
        this.files = new Map();
    }
}

/**
 * A virtual file system.
 * @prop {VDirectory} rootDir the root directory; expected to have an empty name
 * @prop {string} curPath the user's current directory; should never be empty; the root directory is `"/"`
 */
class VFileSystem {
    constructor(rootDir) {
        this.curPath = "/";
        if (rootDir) {
            this.rootDir = rootDir;
        } else {
            this.rootDir = new VDirectory("");
        }

    }

    /**
     * Change directories with the virtual file system.
     * @param {string} newPath the absolute path to change to
     */
    changeDirectory(newPath) {
        console.assert(typeof newPath === "string" && newPath.length > 0, `changeDirectory expects a non-empty string argument, actual argument was type "${typeof newPath}`);
        console.assert(newPath.at(0) === "/", "changeDirectory expects an absolute path argument");
        const components = newPath.split("/").slice(1); // skip the root directory
        let curDir = this.rootDir;
        let partialPath = ""; // for troubleshooting and error messages
        for (const component of components) {
            console.assert(curDir, "curDir should never be falsy");
            // console.assert(component === "" && component !== components[-1], "encountered empty path component in an unexpected position; maybe the path wasn't normalized");
            partialPath += "/" + component;
            if (curDir.directories[component]) {
                curDir = curDir.directories[component];
            } else if (curDir.files[component]) {
                throw new VFileSystemError(`The directory "${newPath}" does not exist; "${partialPath}" is a file, not a directory`);
            } else {
                throw new VFileSystemError(`The directory "${newPath}" does not exist; "${partialPath}" does not exist`);
            }
        }
        this.curPath = newPath;
    }

    /**
     * Retrieve a directory object given a path.
     *
     * Does not mutate `this`.
     *
     * @param {string} path the absolute path to retrieve a directory at
     * @return {VDirectory | null}
     */
    getDir(path) {
        console.assert(typeof path === "string" && path.length > 0, `getDir expects a non-empty string argument, actual argument was type "${typeof path}`);
        console.assert(path.at(0) === "/", "getDir expects an absolute path argument");
        const components = path.split("/").slice(1); // skip the root directory
        let partialPath = ""; // for troubleshooting and error messages
        let curDir = this.rootDir;
        for (const component of components) {
            console.assert(curDir, "curDir should never be falsy");
            if (component === "") {
                console.assert(component !== components[-1], "encountered empty path component in an unexpected position; maybe the path wasn't normalized");
                return curDir;
            }
            partialPath += "/" + component;
            if (curDir.directories[component]) {
                console.assert(curDir.directories[component].name === component, "corrupted file system");
                curDir = curDir.directories[component];
            } else if (curDir.files[component]) {
                console.error(`The directory "${path}" does not exist; "${partialPath}" is a file, not a directory`);
                return null;
            } else {
                console.error(`The directory "${path}" does not exist; "${partialPath}" does not exist`);
                return null;
            }
        }
        return curDir;
    }

    /**
     * Retrieve the current directory.
     *
     * Does not mutate `this`.
     *
     * @return {VDirectory}
     */
    getCurrentDirectory() {
        return this.getDir(this.curPath);
    }

    static fromJsonString(json) {
        try {
            const obj = JSON.parse(json);
            console.debug("parsed JSON value:", obj);
            // TODO: properly validate the loaded object
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