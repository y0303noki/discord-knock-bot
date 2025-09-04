const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('このBotの使い方を表示します'),

  async execute(interaction) {
    // 実処理は events/interactionCreate.js にて
  },
};


