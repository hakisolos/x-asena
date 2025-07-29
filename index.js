const fs = require("fs").promises;
const path = require("path");
const express = require("express");
const config = require("./config");
const connect = require("./lib/connection");
const { getandRequirePlugins } = require("./assets/database/plugins");

const app = express();
const PORT = process.env.PORT || 3000;

let isShuttingDown = false;
let botConnection = null;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: botConnection ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    connection: botConnection ? 'active' : 'inactive'
  });
});

app.post('/restart', (req, res) => {
  res.json({ message: 'Restarting bot...' });
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

const readAndRequireFiles = async (directory) => {
  try {
    const files = await fs.readdir(directory);
    return Promise.all(
      files
        .filter((file) => path.extname(file).toLowerCase() === ".js")
        .map((file) => require(path.join(directory, file)))
    );
  } catch (error) {
    throw new Error(`Failed to load files from ${directory}: ${error.message}`);
  }
};

async function initializeBot() {
  console.log("🚀 X-Asena Starting...");
  
  try {
    console.log("📁 Loading database files...");
    await readAndRequireFiles(path.join(__dirname, "/assets/database/"));
    
    console.log("🔄 Syncing database...");
    await config.DATABASE.sync();
    console.log("✅ Database ready");
    
    console.log("🔌 Installing plugins...");
    await readAndRequireFiles(path.join(__dirname, "./plugins/"));
    await getandRequirePlugins();
    console.log("✅ Plugins installed");
    
    console.log("📱 Connecting to WhatsApp...");
    botConnection = await connect();
    console.log("🎉 Bot initialized successfully");
    
    return true;
  } catch (error) {
    console.error("❌ Bot initialization failed:", error.message);
    
    if (!isShuttingDown) {
      console.log("🔄 Retrying in 10 seconds...");
      setTimeout(initializeBot, 10000);
    }
    
    return false;
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;
  
  try {
    if (botConnection) {
      console.log("📱 Closing WhatsApp connection...");
      await botConnection.end();
      botConnection = null;
    }
    
    if (config.DATABASE) {
      console.log("🗄️ Closing database connection...");
      await config.DATABASE.close();
    }
    
    console.log("✅ Cleanup completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  if (!isShuttingDown) {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  }
});

async function startServer() {
  try {
    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
    });
    
    await initializeBot();
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();