const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('knock')
    .setDescription('ボイスチャンネルへの入室リクエストを送信します')
    .addIntegerOption(option =>
      option
        .setName('timeout')
        .setDescription('リクエストの有効時間（分）')
        .setMinValue(1)
        .setMaxValue(60)
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
