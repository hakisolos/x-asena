const { fromBuffer, mimeTypes } = require("file-type");
const { command, isPrivate } = require("../lib");
const config = require("../config");
command(
  {
    pattern: "ping",
    fromMe: isPrivate,
    desc: "To check if the bot is awake",
    type: "user",
  },
  async (message, match) => {
    const start = new Date().getTime();
    await message.sendMessage(message.jid, "```Is this thing on?```");
    const end = new Date().getTime();
    return await message.sendMessage(
      message.jid,
      "*Boing!*\n ```" + (end - start) + "``` *milliseconds of my life wasted*"
    );
  }
);


command(
  {
    pattern: "alive",
    fromMe: isPrivate,
    desc: "check if bot is alive",
    type: "user",
  },
  async(message, match, m) => {

    const text = `╭─❀ STATUS ❀─╮
│𖣘 BOT NAME: ${config.BOT_NAME || "X-ASENA"}
│𖣘 OWNER: ${config.OWNER_NAME || "Haki"}
│𖣘 STATUS: Active  
│𖣘 MODE: ${config.WORK_TYPE} 
│𖣘 SUPPORT: https://tinyurl.com/nikkatech
╰───────────╯
`
    await m.react("⌛️")
    await message.client.sendMessage(message.jid, {
  image: { url: "https://files.catbox.moe/bxcqsb.jpg" },
  caption: text
});
    return await m.react("")

  }
)

command(
  {
    pattern: "dev",
    desc: "display informationabout dev",
    fromMe: isPrivate,
    type: "user",
  },
  async(message, match, m) => {
    const devInfo = `
━━ About the Developer ━┓
> *Name*: 𝞖𝞓𝞙𝞘 𝙎𝞢𝞒

> *Profession*: Software Developer

> *Nationality*: UAE/NIGERIA

> *Contact*: +2349112171078

> *Website*:  https://www.hakidev.my.id

> *Expertise*: Bot Development, Web Design, AI Systems        
━━━━━━━━━━━       
    `.trim();
    const imageUrl = 'https://files.catbox.moe/bxcqsb.jpg';
		const thumbnailUrl = 'https://files.catbox.moe/cuu1aa.jpg';
    await message.client.sendMessage(message.jid, {
			image: { url: imageUrl },
			caption: devInfo,
			contextInfo: {
				externalAdReply: {
					title: '𝞖𝞓𝞙𝞘 𝙎𝞢𝞒 - Developer Info',
					body: 'About haki',
					sourceUrl: 'www.hakidev.my.id',
					mediaUrl: 'www.hakidev.my.id',
					mediaType: 4,
					showAdAttribution: true,
					renderLargerThumbnail: false,
					thumbnailUrl: thumbnailUrl,
				},
			},
		});
  }
  
)
const metatada = async(message) => {
  return message.client.groupMetadata(message.jid)
}
command(
  {
    pattern: "test",
    fromMe: true,
    type: "user",
    desc: ""
  },
  async (message, match, m) => {
    try {
      const info = await metatada(message)
      await m.reply(info);
      console.log(info)
    } catch (e) {
      
      console.error(e);
    }
  }
)
