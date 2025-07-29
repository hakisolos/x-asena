const plugins = require("../lib/plugins");
const { command, isPrivate, clockString, pm2Uptime } = require("../lib");
const { OWNER_NAME,  BOT_NAME } = require("../config");
const config = require("../config")
const { hostname } = require("os");

command(
  {
    pattern: "menu",
    fromMe: isPrivate,
    desc: "Show commands by category or name",
    dontAddCommandList: true,
    type: "user",
  },
  async (message, match) => {
    const { prefix } = message;
    const BOT_NAME =  config.BOT_NAME || "X-ASENA"
    const OWNER = config.OWNER_NAME || "Haki"
    const readMore = String.fromCharCode(8206).repeat(4001);
    const [date, time] = new Date()
      .toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      .split(",");

    const allCmds = plugins.commands;
    let menu = `\`\`\`╭─𖣘 ${BOT_NAME} 𖣘
𖣘 Prefix: ${prefix}
𖣘 Owner: ${OWNER}
𖣘 Date: ${date}
𖣘 Cmds: ${allCmds.length}
╰───────\`\`\`\n${readMore}`;

    let cmdList = [];
    let categories = [];

    for (const cmd of allCmds) {
      if (
        cmd.pattern instanceof RegExp &&
        !cmd.dontAddCommandList
      ) {
        const pattern = cmd.pattern.toString().split(/\W+/)[1];
        const category = cmd.type?.toLowerCase() || "misc";
        cmdList.push({ cmd: pattern, category });

        if (!categories.includes(category)) {
          categories.push(category);
        }
      }
    }

    cmdList.sort((a, b) => a.cmd.localeCompare(b.cmd));
    categories.sort();

    for (const cat of categories) {
      const cmdsInCat = cmdList.filter((c) => c.category === cat);
      menu += `\n\`\`\`╭── ${cat.toUpperCase()} ──\`\`\``;

      cmdsInCat.forEach(({ cmd }) => {
        menu += `\n│\`\`\`❀ ${cmd.trim()}\`\`\``;
      });

      menu += `\n╰───────\n`;
    }

    menu += `\n\`\`\`X - ASENA\`\`\``;

    const mediaList = [
      "https://files.catbox.moe/bxcqsb.jpg",
      "https://files.catbox.moe/bxcqsb.jpg",
    ];
    const randomMedia = mediaList[Math.floor(Math.random() * mediaList.length)];

    if (randomMedia.endsWith(".mp4")) {
      return await message.client.sendMessage(message.jid, {
        video: { url: randomMedia },
        caption: menu,
        mimetype: "video/mp4",
      });
    } else {
      return await message.client.sendMessage(message.jid, {
        image: { url: randomMedia },
        caption: menu,
      });
    }
  }
);


command(
  {
    pattern: "list",
    fromMe: isPrivate,
    desc: "Show All Commands",
    type: "user",
    dontAddCommandList: true,
  },
  async (message, match, { prefix }) => {
    let menu = "\t\t```Command List```\n";

    let cmnd = [];
    let cmd, desc;
    plugins.commands.map((command) => {
      if (command.pattern) {
        cmd = command.pattern.toString().split(/\W+/)[1];
      }
      desc = command.desc || false;

      if (!command.dontAddCommandList && cmd !== undefined) {
        cmnd.push({ cmd, desc });
      }
    });
    cmnd.sort();
    cmnd.forEach(({ cmd, desc }, num) => {
      menu += `\`\`\`${(num += 1)} ${cmd.trim()}\`\`\`\n`;
      if (desc) menu += `Use: \`\`\`${desc}\`\`\`\n\n`;
    });
    menu += ``;
    return await message.reply(menu);
  }
);
