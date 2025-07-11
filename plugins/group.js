const fs = require("fs");
const { command, isPrivate } = require("../lib");
const { isAdmin, parsedJid } = require("../lib");
const { delay } = require("baileys");

command(
  {
    pattern: "add",
    fromMe: true,
    desc: "add a person to group",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");

    match = match || message.reply_message.jid;
    if (!match) return await message.reply("_Mention user to add");

    const isadmin = await isAdmin(message.jid, message.user, message.client);

    if (!isadmin) return await message.reply("_I'm not admin_");
    const jid = parsedJid(match);

    await message.client.groupParticipantsUpdate(message.jid, jid, "add");

    return await message.reply(`_@${jid[0].split("@")[0]} added_`, {
      mentions: [jid],
    });
  }
);

command(
  {
    pattern: "kick",
    fromMe: true,
    desc: "kicks a person from group",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");

    match = match || message.reply_message.jid;
    if (!match) return await message.reply("_Mention user to kick_");

    const isadmin = await isAdmin(message.jid, message.user, message.client);

    if (!isadmin) return await message.reply("_I'm not admin_");
    const jid = parsedJid(match);

    await message.client.groupParticipantsUpdate(message.jid, jid, "remove");

    return await message.reply(`_@${jid[0].split("@")[0]} kicked_`, {
      mentions: [jid],
    });
  }
);
command(
  {
    pattern: "promote",
    fromMe: true,
    desc: "promote to admin",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");

    match = match || message.reply_message.jid;
    if (!match) return await message.reply("_Mention user to promote_");

    const isadmin = await isAdmin(message.jid, message.user, message.client);

    if (!isadmin) return await message.reply("_I'm not admin_");
    const jid = parsedJid(match);

    await message.client.groupParticipantsUpdate(message.jid, jid, "promote");

    return await message.reply(`_@${jid[0].split("@")[0]} promoted as admin_`, {
      mentions: [jid],
    });
  }
);
command(
  {
    pattern: "demote",
    fromMe: true,
    desc: "demote from admin",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");

    match = match || message.reply_message.jid;
    if (!match) return await message.reply("_Mention user to demote_");

    const isadmin = await isAdmin(message.jid, message.user, message.client);

    if (!isadmin) return await message.reply("_I'm not admin_");
    const jid = parsedJid(match);

    await message.client.groupParticipantsUpdate(message.jid, jid, "demote");

    return await message.reply(
      `_@${jid[0].split("@")[0]} demoted from admin_`,
      {
        mentions: [jid],
      }
    );
  }
);

command(
  {
    pattern: "mute",
    fromMe: true,
    desc: "nute group",
    type: "group",
  },
  async (message, match, m, client) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");
    if (!isAdmin(message.jid, message.user, message.client))
      return await message.reply("_I'm not admin_");
    await message.reply("_Muting_");
    return await client.groupSettingUpdate(message.jid, "announcement");
  }
);

command(
  {
    pattern: "unmute",
    fromMe: true,
    desc: "unmute group",
    type: "group",
  },
  async (message, match, m, client) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");
    if (!isAdmin(message.jid, message.user, message.client))
      return await message.reply("_I'm not admin_");
    await message.reply("_Unmuting_");
    return await client.groupSettingUpdate(message.jid, "not_announcement");
  }
);

command(
  {
    pattern: "gjid",
    fromMe: true,
    desc: "gets jid of all group members",
    type: "group",
  },
  async (message, match, m, client) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");
    let { participants } = await client.groupMetadata(message.jid);
    let participant = participants.map((u) => u.id.split("@")[0]);
    let text = participant.join("\n");
    fs.writeFileSync("group.txt", text);
  }
);

command(
  {
    pattern: "tagall",
    fromMe: true,
    desc: "mention all users in group",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup) return;
    const { participants } = await message.client.groupMetadata(message.jid);
    let teks = "";
    for (let mem of participants) {
      teks += ` @${mem.id.split("@")[0]}\n`;
    }
    message.sendMessage(message.jid, teks.trim(), {
      mentions: participants.map((a) => a.id),
    });
  }
);

command(
  {
    pattern: "tag",
    fromMe: true,
    desc: "mention all users in group",
    type: "group",
  },
  async (message, match) => {
    console.log("match")
    match = match || message.reply_message.text;
    if (!match) return message.reply("_Enter or reply to a text to tag_");
    if (!message.isGroup) return;
    const { participants } = await message.client.groupMetadata(message.jid);
    message.sendMessage(message.jid, match, {
      mentions: participants.map((a) => a.id),
    });
  }
);

command(
  {
    pattern: "mention",
    fromMe: true,
    desc: "mention all users in group",
    type: "group",
  },
  async (message, match) => {
    console.log("match")
    match = match || message.reply_message.text;
    if (!match) return message.reply("_Enter or reply to a text to tag_");
    if (!message.isGroup) return;
    const { participants } = await message.client.groupMetadata(message.jid);
    message.sendMessage(message.jid, "_Notified Everyone_", {
      mentions: participants.map((a) => a.id),
    });
  }
);
/*

const participants = fs.readFileSync("removed.txt", "utf-8").split("\n");
//const participants = ["9656459062"]
command(
  {
    pattern: "inactive",
    fromMe: true,
    desc: "Remove the participants from the group who are in removed.txt",
    type: "group",
  },
  async (message, match) => {
    if (!message.isGroup)
      return await message.reply("_This command is for groups_");
    if (!isAdmin(message.jid, message.user, message.client))
      return await message.reply("_I'm not admin_");
    await message.reply("_Removing_");
    for (let i = 0; i < participants.length; i++) {
      await message.client.groupParticipantsUpdate(
        message.jid,
        parsedJid("91" + participants[i]),
        "remove"
      );
      await delay(3000);
      console.log("Removed:", participants[i]);
    }
  }
);
*/