const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deny')
    .setDescription('入室リクエストを拒否します')
    .addIntegerOption(option =>
      option
        .setName('request_id')
        .setDescription('拒否するリクエストのID')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
