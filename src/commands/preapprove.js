const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../database/init');
const PermissionManager = require('../utils/permissions');
const { bot } = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('preapprove')
    .setDescription('特定のユーザーにボイスチャンネルへの入室権限をあらかじめ付与します。')
    .addUserOption(option =>
      option.setName('target_user')
        .setDescription('入室権限を付与するユーザー')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration_hours')
        .setDescription('権限の有効期限（時間単位、既定: 2時間）')
        .setRequired(false)),
  async execute(interaction) {
    // 応答を保留し、処理時間を確保します。これにより3秒以上の処理が可能になります。
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('target_user');
    const durationHours = interaction.options.getInteger('duration_hours') || 2; // デフォルト2時間

    const voiceChannelId = bot.allowedVoiceChannelId;

    if (!voiceChannelId) {
      await interaction.reply({ content: '許可されたボイスチャンネルが設定されていません。Botのconfig.jsを確認してください。', ephemeral: true });
      await interaction.editReply({ content: '許可されたボイスチャンネルが設定されていません。Botのconfig.jsを確認してください。' });
      return;
    }
    
    const voiceChannel = await interaction.client.channels.fetch(voiceChannelId);
    if (!voiceChannel || voiceChannel.type !== 2) {
      await interaction.reply({ content: '設定されたボイスチャンネルが見つからないか、ボイスチャンネルではありません。', ephemeral: true });
      await interaction.editReply({ content: '設定されたボイスチャンネルが見つからないか、ボイスチャンネルではありません。' });
      return;
    }

    const durationMs = durationHours * 60 * 60 * 1000;

    try {
      const permissionManager = new PermissionManager(interaction.client);

      // ユーザーにボイスチャンネル接続権限を付与 (Discord側のタイマーは preapprove の durationMs に基づく)
      await permissionManager.grantVoicePermission(voiceChannel.id, targetUser.id, durationMs);
      // データベースに事前承認情報を記録。voiceStateUpdate.js がこの 'pre_approved' タイプを検知する。
      await db.createPermissionGrant(voiceChannel.id, targetUser.id, 'pre_approved', durationMs);

      // ユーザーにDMを送信
      try {
        await targetUser.send(
          `## ${voiceChannel.name} チャンネルへの事前入室権限が付与されました！` +
          `\n${voiceChannel.name} チャンネルへノックなしで入室できます。` +
          `\nこの権限は **${durationHours} 時間** 有効です。` +
          `\n\n（※一度入室すると、通常のノック承認と同じく数分で権限が自動削除されます。再入室の際は再度承認が必要です。）`
        );
        await interaction.editReply({
          content: `✅ **${targetUser.tag}** に **${voiceChannel.name}** チャンネルへの事前入室権限を **${durationHours} 時間** 付与しました。`,
        });
      } catch (dmError) {
        console.warn(`Failed to send DM to ${targetUser.tag}:`, dmError);
        await interaction.editReply({
          content: `✅ **${targetUser.tag}** に権限を付与しましたが、DMの送信に失敗しました。`,
        });
      }

    } catch (error) {
      console.error('Error pre-approving user:', error);
      // deferReply後なのでeditReplyを使う
      await interaction.editReply({
        content: `❌ ユーザーの事前承認に失敗しました: ${error.message}`,
      });
    }
  },
};
