const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug_perms')
    .setDescription('指定チャンネルでのBot実効権限を表示します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('対象チャンネル（VC/テキスト/カテゴリ可）')
        .setRequired(true)
    ),

  async execute(interaction) {
    // 実処理は events/interactionCreate.js で実行
  },
};


