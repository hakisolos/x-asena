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

const connect = async () => {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__basedir, sessionDir)
    );
    const { version } = await fetchLatestBaileysVersion();

    conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: true,
      logger,
      browser: Browsers.macOS("Desktop"),
      downloadHistory: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      emitOwnEvents: true,
      version,
      getMessage: async (key) =>
        (loadMessage(key.id) || {}).message || { conversation: null },
    });

    conn.ev.on("connection.update", handleConnectionUpdate(conn, saveCreds));
    conn.ev.on("creds.update", saveCreds);
    conn.ev.on("group-participants.update", async (data) =>
      Greetings(data, conn)
    );
    conn.ev.on("chats.update", async (chats) => chats.forEach(saveChat));
    conn.ev.on("messages.upsert", handleMessages(conn));

    process.on("unhandledRejection", (err) =>
      handleError(err, conn, "unhandledRejection")
    );
    process.on("uncaughtException", (err) =>
      handleError(err, conn, "uncaughtException")
    );
  } catch (err) {
    console.error("Startup Error:", err);
    await delay(3000);
    connect();
  } finally {
    isConnecting = false;
  }

  return conn;
};

const handleConnectionUpdate = (conn, saveCreds) => async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) QRCode.generate(qr, { small: true });

  switch (connection) {
    case "connecting":
      console.log("Connecting to WhatsApp...");
      break;
    case "open":
      console.log("Login Successful!");
      const packageVersion = require("../package.json").version;
      const totalPlugins = plugins.commands.length;
      const workType = config.WORK_TYPE;
      const statusMessage = `\`\`\`X-asena connected\nVersion: ${packageVersion}\nTotal Plugins: ${totalPlugins}\nWorktype: ${workType}\`\`\``;
      await conn.sendMessage(conn.user.id, { text: statusMessage });
      break;
    case "close":
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Reconnecting...");
        await delay(3000);
        connect();
      } else {
        console.log("Session ended. Please scan QR again.");
        try {
          fs.rmSync(path.join(__basedir, sessionDir), { recursive: true, force: true });
        } catch (_) {}
        await delay(2000);
        connect();
      }
      break;
  }
};

const handleMessages = (conn) => async (m) => {
  if (m.type !== "notify") return;

  const msg = await serialize(JSON.parse(JSON.stringify(m.messages[0])), conn);
  await saveMessage(m.messages[0], msg.sender);
  if (config.AUTO_READ) await conn.readMessages(msg.key);
  if (config.AUTO_STATUS_READ && msg.from === "status@broadcast")
    await conn.readMessages(msg.key);

  processMessage(msg, conn, m);
};

const handleError = async (err, conn, type) => {
  const error = util.format(err);
  const text = `\`\`\`X-asena ${type}: \n${error}\`\`\``;
  if (conn.user && conn.user.id)
    await conn.sendMessage(conn.user.id, { text });
  console.error(err);
};

const processMessage = async (msg, conn, m) => {
  if (!msg || !msg.body) return;

  const chatId = msg.from;
  const pausedChats = await PausedChats.getPausedChats();
  const regex = new RegExp(`${config.HANDLERS}( ?resume)`, "is");

  if (
    pausedChats.some(
      (pausedChat) => pausedChat.chatId === chatId && !regex.test(msg.body)
    )
  )
    return;

  if (config.LOGS) logMessage(msg, conn);

  executeCommand(msg, conn, m);
};

const logMessage = async (msg, conn) => {
  const name = await getName(msg.sender);
  const groupName = msg.from.endsWith("@g.us")
    ? (await conn.groupMetadata(msg.from)).subject
    : msg.from;
  console.log(`At : ${groupName}\nFrom : ${name}\nMessage:${msg.body || msg}\id : ${msg.sender}`);
};

const executeCommand = (msg, conn, m) => {
  plugins.commands.forEach(async (command) => {
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
