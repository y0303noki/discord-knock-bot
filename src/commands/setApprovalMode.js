const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_approval_mode')
    .setDescription('チャンネルの承認権限モードを設定します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('設定するボイスチャンネル')
        .setRequired(true)
        .addChannelTypes(2) // GUILD_VOICE
    )
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('承認権限モード')
        .setRequired(true)
        .addChoices(
          { name: 'チャンネルメンバー全員', value: 'channel_member' },
          { name: 'ボイス接続者のみ', value: 'voice_connected' },
          { name: 'ロール指定', value: 'role_based' }
        )
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('承認権限を与えるロール（ロール指定モードの場合）')
        .setRequired(false)
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
