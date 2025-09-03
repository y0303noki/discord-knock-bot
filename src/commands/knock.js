const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('knock')
    .setDescription('ボイスチャンネルへの入室リクエストを送信します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('入室を希望するボイスチャンネル')
        .setRequired(true)
        .addChannelTypes(2) // GUILD_VOICE
    )
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
