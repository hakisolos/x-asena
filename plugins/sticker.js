const config = require("../config");
const { command, isPrivate, toAudio } = require("../lib/");
const { webp2mp4, textToImg } = require("../lib/functions");
command(
  {
    pattern: "sticker",
    fromMe: isPrivate,
    desc: "Converts Photo/video/text to sticker",
    type: "converter",
  },
  async (message, match, m) => {
    if (!message.reply_message&& (!message.reply_message.video || !message.reply_message.sticker || !message.reply_message.text))
      return await message.reply("_Reply to photo/video/text_");
    var buff;
    if (message.reply_message.text) {
      buff = await textToImg(message.reply_message.text);
    } else {
      buff = await m.quoted.download();
    }

    message.sendMessage(
      message.jid,
      buff,
      { packname: config.PACKNAME, author: config.AUTHOR },
      "sticker"
    );
  }
);


command(
  {
    pattern: "photo",
    fromMe: isPrivate,
    desc: "Changes sticker to Photo",
    type: "converter",
  },
  async (message, match, m) => {
    if (!message.reply_message.sticker)
      return await message.reply("_Not a sticker_");
    let buff = await m.quoted.download();
    return await message.sendMessage(message.jid, buff, {}, "image");
  }
);



command(
  {
    pattern: "img",
    fromMe: isPrivate,
    desc: "Converts Sticker to image",
    type: "converter",
  },
  async (message, match, m) => {
    if (!message.reply_message.sticker)
      return await message.reply("_Reply to a sticker_");
    let buff = await m.quoted.download();
    return await message.sendMessage(message.jid, buff, {}, "image");
  }
);
