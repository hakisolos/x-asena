const pino = require("pino");
const path = require("path");
const fs = require("fs");
const util = require("util");
const plugins = require("./plugins");
const QRCode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} = require("baileys");
const retrieveSession = require("./sesion");
const { PausedChats } = require("../assets/database");
const config = require("../config");
const { serialize, Greetings } = require("./index");
const { Image, Message, Sticker, Video, AllMessage } = require("./Messages");
const {
  loadMessage,
  saveMessage,
  saveChat,
  getName,
} = require("../assets/database/StoreDb");

const logger = pino({ level: "silent" });
const sessionDir = "./session";
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

let isConnecting = false;
let conn;

const connect = async () => {
  if (isConnecting) {
    console.log("Already connecting...");
    return;
  }
  
  isConnecting = true;
  console.log("Starting connection process...");

  try {
    await retrieveSession(config.SESSION_ID, path.join(__dirname, "../session"));
    console.log("Setting up authentication state...");
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__basedir, sessionDir)
    );
    
    console.log("Creating WhatsApp socket...");
    conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.macOS("Desktop"),
      downloadHistory: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      emitOwnEvents: true,
      getMessage: async (key) => {
        try {
          const message = await loadMessage(key.id);
          return message?.message || { conversation: null };
        } catch (error) {
          console.error("Error loading message:", error);
          return { conversation: null };
        }
      },
    });

    console.log("Setting up event listeners...");
    conn.ev.on("connection.update", handleConnectionUpdate(conn, saveCreds));
    conn.ev.on("creds.update", saveCreds);
    conn.ev.on("group-participants.update", async (data) => {
      try {
        await Greetings(data, conn);
      } catch (error) {
        console.error("Error in group participants update:", error);
      }
    });
    conn.ev.on("chats.update", async (chats) => {
      try {
        await Promise.all(chats.map(saveChat));
      } catch (error) {
        console.error("Error saving chats:", error);
      }
    });
    conn.ev.on("messages.upsert", handleMessages(conn));

    process.on("unhandledRejection", (err) =>
      handleError(err, conn, "unhandledRejection")
    );
    process.on("uncaughtException", (err) =>
      handleError(err, conn, "uncaughtException")
    );

    console.log("WhatsApp socket created successfully!");
    
  } catch (err) {
    console.error("Connection Error:", err);
    isConnecting = false;
    console.log("Retrying connection in 5 seconds...");
    await delay(5000);
    return connect();
  }

  return conn;
};

const handleConnectionUpdate = (conn, saveCreds) => async (update) => {
  const { connection, lastDisconnect, qr } = update;

  switch (connection) {
    case "connecting":
      console.log("Connecting to WhatsApp...");
      break;
      
    case "open":
      console.log("✅ Login Successful!");
      isConnecting = false;
      
      try {
        const packageVersion = require("../package.json").version;
        const totalPlugins = plugins.commands.length;
        const workType = config.WORK_TYPE;
        const statusMessage = `\`\`\`X-asena connected\nVersion: ${packageVersion}\nTotal Plugins: ${totalPlugins}\nWorktype: ${workType}\`\`\``;
        await conn.sendMessage(conn.user.id, { text: statusMessage });
      } catch (error) {
        console.error("Error sending status message:", error);
      }
      break;
      
    case "close":
      console.log("Connection closed");
      isConnecting = false;
      
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Reconnecting in 3 seconds...");
        await delay(3000);
        connect();
      } else {
        console.log("Session ended. Clearing session and restarting...");
        try {
          fs.rmSync(path.join(__basedir, sessionDir), { 
            recursive: true, 
            force: true 
          });
        } catch (cleanupError) {
          console.error("Error cleaning up session:", cleanupError);
        }
        await delay(2000);
        connect();
      }
      break;
  }
};

const handleMessages = (conn) => async (m) => {
  try {
    if (m.type !== "notify") return;

    const msg = await serialize(JSON.parse(JSON.stringify(m.messages[0])), conn);
    await saveMessage(m.messages[0], msg.sender);
    
    if (config.AUTO_READ) await conn.readMessages(msg.key);
    if (config.AUTO_STATUS_READ && msg.from === "status@broadcast")
      await conn.readMessages(msg.key);

    await processMessage(msg, conn, m);
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

const handleError = async (err, conn, type) => {
  const error = util.format(err);
  const text = `\`\`\`X-asena ${type}: \n${error}\`\`\``;
  
  try {
    if (conn?.user?.id) {
      await conn.sendMessage(conn.user.id, { text });
    }
  } catch (sendError) {
    console.error("Error sending error message:", sendError);
  }
  
  console.error(`${type}:`, err);
};

const processMessage = async (msg, conn, m) => {
  try {
    if (!msg || !msg.body) return;

    const chatId = msg.from;
    const pausedChats = await PausedChats.getPausedChats();
    const regex = new RegExp(`${config.HANDLERS}( ?resume)`, "is");

    if (
      pausedChats.some(
        (pausedChat) => pausedChat.chatId === chatId && !regex.test(msg.body)
      )
    ) {
      return;
    }

    if (config.LOGS) await logMessage(msg, conn);

    executeCommand(msg, conn, m);
  } catch (error) {
    console.error("Error processing message:", error);
  }
};

const logMessage = async (msg, conn) => {
  try {
    const name = await getName(msg.sender);
    const groupName = msg.from.endsWith("@g.us")
      ? (await conn.groupMetadata(msg.from)).subject
      : msg.from;
    console.log(`At : ${groupName}\nFrom : ${name}\nMessage: ${msg.body || msg}\nId : ${msg.sender}`);
  } catch (error) {
    console.error("Error logging message:", error);
  }
};

const executeCommand = (msg, conn, m) => {
  plugins.commands.forEach(async (command) => {
    try {
      if (!msg.sudo && (command.fromMe || config.WORK_TYPE === "private")) return;

      const handleCommand = (Instance, args) => {
        const whats = new Instance(conn, msg);
        command.function(whats, ...args, msg, conn, m);
      };

      const text_msg = msg.body;

      if (text_msg && command.pattern) {
        const iscommand = text_msg.match(command.pattern);
        if (iscommand) {
          msg.prefix = iscommand[1];
          msg.command = `${iscommand[1]}${iscommand[2]}`;
          handleCommand(Message, [iscommand[3] || false]);
        }
      } else {
        handleMediaCommand(command, msg, text_msg, handleCommand);
      }
    } catch (error) {
      console.error("Error executing command:", error);
    }
  });
};

const handleMediaCommand = (command, msg, text_msg, handleCommand) => {
  switch (command.on) {
    case "text":
      if (text_msg) handleCommand(Message, [text_msg]);
      break;
    case "image":
      if (msg.type === "imageMessage") handleCommand(Image, [text_msg]);
      break;
    case "sticker":
      if (msg.type === "stickerMessage") handleCommand(Sticker, []);
      break;
    case "video":
      if (msg.type === "videoMessage") handleCommand(Video, []);
      break;
    case "delete":
      if (msg.type === "protocolMessage") {
        const whats = new Message(conn, msg);
        whats.messageId = msg.message.protocolMessage.key?.id;
        command.function(whats, msg, conn);
      }
      break;
    case "message":
      handleCommand(AllMessage, []);
      break;
  }
};

module.exports = connect;
