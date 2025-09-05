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
    const targetUser = interaction.options.getUser('target_user');
    const durationHours = interaction.options.getInteger('duration_hours') || 2; // デフォルト2時間

    const voiceChannelId = bot.allowedVoiceChannelId;

    if (!voiceChannelId) {
      await interaction.reply({ content: '許可されたボイスチャンネルが設定されていません。Botのconfig.jsを確認してください。', ephemeral: true });
      return;
    }
    
    const voiceChannel = await interaction.client.channels.fetch(voiceChannelId);
    if (!voiceChannel || voiceChannel.type !== 2) {
      await interaction.reply({ content: '設定されたボイスチャンネルが見つからないか、ボイスチャンネルではありません。', ephemeral: true });
      return;
    }

    const durationMs = durationHours * 60 * 60 * 1000; // ミリ秒に変換
    const preApproveType = 'pre_approved';

    try {
      const permissionManager = new PermissionManager(interaction.client);

      // ユーザーにボイスチャンネル接続権限を付与 (Discord側のタイマーは preapprove の durationMs に基づく)
      await permissionManager.grantVoicePermission(voiceChannel.id, targetUser.id, durationMs);
      
      // データベースに事前承認情報を記録（入室時の判定と、退室後のrevokeAfterExitMs適用のため 'voice_connect' タイプを使用）
      // 初期付与期間は durationMs とし、入室後は revokeAfterExitMs が適用されるようにする
      await db.createPermissionGrant(voiceChannel.id, targetUser.id, 'voice_connect', durationMs);

      // ユーザーにDMを送信
      try {
        await targetUser.send(
          `## ${voiceChannel.name} チャンネルへの事前入室権限が付与されました！` +
          `\n${voiceChannel.name} チャンネルへノックなしで入室できます。` +
          `\nこの権限は **${durationHours} 時間** 有効です。` +
          `\n\n（※一度入室すると、通常のノック承認と同じく数分で権限が自動削除されます。再入室の際は再度承認が必要です。）`
        );
      } catch (dmError) {
        console.warn(`Failed to send DM to ${targetUser.tag}:`, dmError);
        await interaction.followUp({ content: `${targetUser.tag} へのDM送信に失敗しましたが、権限は付与されました。`, ephemeral: true });
      }

      await interaction.reply({
        content: `**${targetUser.tag}** に **${voiceChannel.name}** チャンネルへの事前入室権限を **${durationHours} 時間** 付与しました。`,
        ephemeral: true,
      });

    } catch (error) {
      console.error('Error pre-approving user:', error);
      await interaction.reply({
        content: `ユーザーの事前承認に失敗しました: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
