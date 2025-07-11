const { command, isPrivate } = require("../lib");

command(
  {
    pattern: "test",
    fromMe: true,
    desc: "send a button message",
    usage: "#button",
    type: "message",
  },
  async (message, match, m) => {
   return await message.client.sendMessage("120363416658748282@g.us", {text: "test"})
  }
);
