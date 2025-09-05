const { Events } = require('discord.js');
const db = require('../database/init');
const PermissionManager = require('../utils/permissions');
const { bot } = require('../config/config');

let permissionManager = null;

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      if (!permissionManager) {
        permissionManager = new PermissionManager(newState.client);
      }

      // 入室検知: oldState.channelId が null で、newState.channelId が存在する場合
      if (!oldState.channelId && newState.channelId) {
        const channelId = newState.channelId;
        const userId = newState.id;
        const preApproveType = 'pre_approved';

        // 事前承認の記録があるか確認
        const preApprovedGrant = await db.getPermissionGrant(channelId, userId, preApproveType);
        if (preApprovedGrant && new Date(preApprovedGrant.expires_at) > new Date()) {
          // 有効な事前承認がある場合、DBから削除（「入室されたら今までの機能と同じにする」ため）
          await db.deletePermissionGrant(channelId, userId, preApproveType);
          console.log(`Pre-approved user ${userId} entered channel ${channelId}. Removing pre-approval grant.`);
          // ここでは権限剥奪は行わない。preapproveコマンドで付与されたgrantVoicePermissionのdurationMsに任せる。
        }
      }

      // 退室検知: oldState.channelId は存在し、newState.channelId は null または別チャンネル
      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const channelId = oldState.channelId;
        const userId = oldState.id;

        // 付与記録がある場合のみ剥奪（他の理由で権限を持っているユーザーには触らない）
        const grant = await db.getPermissionGrant(channelId, userId, 'voice_connect');
        if (grant) {
          // 退室後に遅延剥奪（既定30分）
          setTimeout(async () => {
            try {
              await permissionManager.revokeVoicePermission(channelId, userId);
              await db.deletePermissionGrant(channelId, userId, 'voice_connect');
            } catch (e) {
              console.error('Failed to revoke after delay:', e);
            }
          }, bot.revokeAfterExitMs);
        }
      }
    } catch (error) {
      console.error('voiceStateUpdate error:', error);
    }
  }
};
