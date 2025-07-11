const fs = require("fs").promises;
const path = require("path");
const config = require("./config");
const connect = require("./lib/connection");
const { getandRequirePlugins } = require("./assets/database/plugins");

global.__basedir = __dirname; // Set the base directory for the project

const readAndRequireFiles = async (directory) => {
  try {
    const files = await fs.readdir(directory);
    return Promise.all(
      files
        .filter((file) => path.extname(file).toLowerCase() === ".js")
        .map((file) => require(path.join(directory, file)))
    );
  } catch (error) {
    console.error("Error reading and requiring files:", error);
    throw error;
  }
};

async function initialize() {
  console.log("X-Asena");

  try {
    // Load all database and plugin files
    await readAndRequireFiles(path.join(__dirname, "/assets/database/"));
    console.log("Syncing Database");
    await config.DATABASE.sync();

    console.log("⬇  Installing Plugins...");
    await readAndRequireFiles(path.join(__dirname, "./plugins/"));
    await getandRequirePlugins();
    console.log("✅ Plugins Installed!");

    // Socket connection for status/logging
    const io = require("socket.io-client");
    const ws = io("https://socket.xasena.me/", { reconnection: true });
    ws.on("connect", () => console.log("Connected to server"));
    ws.on("disconnect", () => console.log("Disconnected from server"));

    // Start WhatsApp connection
    await connect();
  } catch (error) {
    console.error("Initialization error:", error);
    process.exit(1);
  }
}

initialize();
