const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('入室リクエストを承認します')
    .addIntegerOption(option =>
      option
        .setName('request_id')
        .setDescription('承認するリクエストのID')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
