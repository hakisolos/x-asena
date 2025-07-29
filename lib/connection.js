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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [3000, 5000, 10000, 20000, 30000];

const connect = async () => {
  if (isConnecting) return;
  
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, sessionDir)
    );
    
    const { version } = await fetchLatestBaileysVersion();
    
    conn = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.macOS("Desktop"),
      downloadHistory: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      getMessage: async (key) => {
        try {
          const message = await loadMessage(key.id);
          return message?.message || { conversation: null };
        } catch (error) {
          return { conversation: null };
        }
      },
    });

    conn.ev.on("connection.update", handleConnectionUpdate(conn, saveCreds));
    conn.ev.on("creds.update", saveCreds);
    conn.ev.on("group-participants.update", async (data) => {
      try {
        await Greetings(data, conn);
      } catch (error) {
        console.error("Group participants error:", error.message);
      }
    });
    conn.ev.on("chats.update", async (chats) => {
      try {
        await Promise.all(chats.map(saveChat));
      } catch (error) {
        console.error("Chats update error:", error.message);
      }
    });
    conn.ev.on("messages.upsert", handleMessages(conn));

    process.on("unhandledRejection", (err) =>
      handleError(err, conn, "unhandledRejection")
    );
    process.on("uncaughtException", (err) =>
      handleError(err, conn, "uncaughtException")
    );
    
  } catch (err) {
    console.error("Connection setup failed:", err.message);
    isConnecting = false;
    await handleReconnect();
  }

  return conn;
};

const handleConnectionUpdate = (conn, saveCreds) => async (update) => {
  const { connection, lastDisconnect, qr } = update;
  
  if (qr) {
    console.log("Scan QR code to login:");
    QRCode.generate(qr, { small: true });
  }
  
  switch (connection) {
    case "connecting":
      break;
      
    case "open":
      console.log("✅ WhatsApp Connected");
      isConnecting = false;
      reconnectAttempts = 0;
      
      try {
        const packageVersion = require("../package.json").version;
        const totalPlugins = plugins.commands.length;
        const workType = config.WORK_TYPE;
        const statusMessage = `X-asena connected\nVersion: ${packageVersion}\nPlugins: ${totalPlugins}\nMode: ${workType}`;
        await conn.sendMessage(conn.user.id, { text: statusMessage });
      } catch (error) {
        console.error("Status message failed:", error.message);
      }
      break;
      
    case "close":
      isConnecting = false;
      const disconnectReason = lastDisconnect?.error?.output?.statusCode;
      
      switch (disconnectReason) {
        case DisconnectReason.loggedOut:
          console.log("Session logged out, clearing session...");
          await clearSession();
          await delay(2000);
          connect();
          break;
          
        case DisconnectReason.connectionClosed:
        case DisconnectReason.connectionLost:
        case DisconnectReason.restartRequired:
          await handleReconnect();
          break;
          
        case DisconnectReason.timedOut:
          console.log("Connection timed out");
          await handleReconnect();
          break;
          
        case DisconnectReason.badSession:
          console.log("Bad session, clearing and restarting...");
          await clearSession();
          await delay(2000);
          connect();
          break;
          
        default:
          console.log("Connection closed, reason:", disconnectReason);
          await handleReconnect();
          break;
      }
      break;
  }
};

const handleReconnect = async () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log("Max reconnection attempts reached, clearing session...");
    await clearSession();
    reconnectAttempts = 0;
    await delay(5000);
    return connect();
  }
  
  const delayTime = RECONNECT_DELAYS[reconnectAttempts] || 30000;
  console.log(`Reconnecting in ${delayTime/1000}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectAttempts++;
  await delay(delayTime);
  return connect();
};

const clearSession = async () => {
  try {
    const sessionPath = path.join(__dirname, sessionDir);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Session cleanup failed:", error.message);
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
    console.error("Message handling error:", error.message);
  }
};

const handleError = async (err, conn, type) => {
  const error = util.format(err);
  const text = `X-asena ${type}:\n${error}`;
  
  try {
    if (conn?.user?.id) {
      await conn.sendMessage(conn.user.id, { text });
    }
  } catch (sendError) {
    console.error("Error notification failed:", sendError.message);
  }
  
  console.error(`${type}:`, err.message || err);
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
    console.error("Message processing error:", error.message);
  }
};

const logMessage = async (msg, conn) => {
  try {
    const name = await getName(msg.sender);
    const groupName = msg.from.endsWith("@g.us")
      ? (await conn.groupMetadata(msg.from)).subject
      : "Private";
    console.log(`[${groupName}] ${name}: ${msg.body || "Media"}`);
  } catch (error) {
    console.error("Logging error:", error.message);
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
      console.error("Command execution error:", error.message);
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