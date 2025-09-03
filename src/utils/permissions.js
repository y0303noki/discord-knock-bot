/**
 * ボイスチャンネルの権限管理ユーティリティ
 */

class PermissionManager {
  constructor(client) {
    this.client = client;
  }

  /**
   * ユーザーにボイスチャンネルへの接続権限を一時的に付与
   * @param {string} channelId - チャンネルID
   * @param {string} userId - ユーザーID
   * @param {number} durationMs - 権限の有効期間（ミリ秒）
   */
  async grantVoicePermission(channelId, userId, durationMs = 300000) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== 2) { // GUILD_VOICE
        throw new Error('Invalid voice channel');
      }

      // 権限を付与
      await channel.permissionOverwrites.edit(userId, {
        Connect: true,
        Speak: true,
      });

      // 有効期限を設定（自動削除）
      if (durationMs > 0) {
        setTimeout(async () => {
          try {
            await this.revokeVoicePermission(channelId, userId);
          } catch (error) {
            console.error('Failed to revoke voice permission:', error);
          }
        }, durationMs);
      }

      return true;
    } catch (error) {
      console.error('Failed to grant voice permission:', error);
      throw error;
    }
  }

  /**
   * ユーザーのボイスチャンネル接続権限を剥奪
   * @param {string} channelId - チャンネルID
   * @param {string} userId - ユーザーID
   */
  async revokeVoicePermission(channelId, userId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      await channel.permissionOverwrites.edit(userId, {
        Connect: false,
        Speak: false,
      });

      return true;
    } catch (error) {
      console.error('Failed to revoke voice permission:', error);
      throw error;
    }
  }

  /**
   * チャンネルの現在の接続権限を確認
   * @param {string} channelId - チャンネルID
   * @param {string} userId - ユーザーID
   */
  async checkVoicePermission(channelId, userId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return false;

      const permissions = channel.permissionsFor(userId);
      return permissions?.has('Connect') || false;
    } catch (error) {
      console.error('Failed to check voice permission:', error);
      return false;
    }
  }

  /**
   * チャンネルをプライベートモードに設定
   * @param {string} channelId - チャンネルID
   */
  async setChannelPrivate(channelId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== 2) return;

      // @everyone の接続権限を剥奪
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: false,
      });

      return true;
    } catch (error) {
      console.error('Failed to set channel private:', error);
      throw error;
    }
  }

  /**
   * チャンネルをパブリックモードに戻す
   * @param {string} channelId - チャンネルID
   */
  async setChannelPublic(channelId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== 2) return;

      // @everyone の接続権限を付与
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: true,
        Speak: true,
      });

      return true;
    } catch (error) {
      console.error('Failed to set channel public:', error);
      throw error;
    }
  }

  /**
   * ユーザーがチャンネルの承認権限を持っているかをチェック
   * @param {string} channelId - チャンネルID
   * @param {string} userId - ユーザーID
   * @param {string} permissionType - 権限タイプ ('channel_member', 'voice_connected', 'role_based')
   * @param {Array} allowedRoles - 許可ロールIDの配列（role_basedの場合）
   */
  async checkApprovalPermission(channelId, userId, permissionType = 'channel_member', allowedRoles = []) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return false;

      switch (permissionType) {
        case 'channel_member':
          // チャンネル内のメンバーのみ（デフォルト）
          return channel.members.has(userId);

        case 'voice_connected':
          // ボイスチャンネルに接続している人のみ
          if (channel.type !== 2) return false; // GUILD_VOICE
          const voiceChannel = channel;
          return voiceChannel.members.has(userId);

        case 'role_based':
          // 指定されたロールを持つ人のみ
          if (allowedRoles.length === 0) return false;
          const guild = channel.guild;
          const member = await guild.members.fetch(userId);
          return member.roles.cache.some(role => allowedRoles.includes(role.id));

        default:
          return false;
      }
    } catch (error) {
      console.error('Failed to check approval permission:', error);
      return false;
    }
  }

  /**
   * チャンネルの承認権限設定を取得
   * @param {string} channelId - チャンネルID
   */
  async getChannelApprovalSettings(channelId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return null;

      // チャンネルのトピックから設定を取得（将来的に拡張可能）
      const topic = channel.topic || '';
      const settings = {
        permissionType: 'voice_connected', // デフォルト: ボイス接続者のみ
        allowedRoles: []
      };

      // トピックに設定が記載されている場合のパース（例: [knock:role_based:role1,role2]）
      const knockSetting = topic.match(/\[knock:(\w+)(?::([^[\]]+))?\]/);
      if (knockSetting) {
        settings.permissionType = knockSetting[1];
        if (knockSetting[2]) {
          settings.allowedRoles = knockSetting[2].split(',');
        }
      }

      return settings;
    } catch (error) {
      console.error('Failed to get channel approval settings:', error);
      return null;
    }
  }
}

module.exports = PermissionManager;
