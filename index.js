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
    console.log("Loading database files...");
    await readAndRequireFiles(path.join(__dirname, "/assets/database/"));
    
    console.log("Syncing Database...");
    await config.DATABASE.sync();
    console.log("✅ Database synced!");

    console.log("⬇  Installing Plugins...");
    await readAndRequireFiles(path.join(__dirname, "./plugins/"));
    await getandRequirePlugins();
    console.log("✅ Plugins Installed!");
    
    console.log("🔗 Starting WhatsApp connection...");
    await connect();
    
  } catch (error) {
    console.error("❌ Initialization error:", error);
    
    // Wait before retrying
    console.log("Retrying initialization in 5 seconds...");
    setTimeout(() => {
      initialize();
    }, 5000);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

initialize();