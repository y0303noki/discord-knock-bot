const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_public')
    .setDescription('ボイスチャンネルをパブリックモードに設定します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('パブリックに設定するボイスチャンネル')
        .setRequired(true)
        .addChannelTypes(2) // GUILD_VOICE
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
