const { Events } = require('discord.js');
const db = require('../database/init');
const { bot } = require('../config/config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`🚀 Bot is ready! Logged in as ${client.user.tag}`);

    // データベースの定期クリーンアップを開始
    setInterval(async () => {
      try {
        const cleanedCount = await db.cleanupExpiredRequests();
        if (cleanedCount > 0) {
          console.log(`🧹 Cleaned up ${cleanedCount} expired knock requests`);
        }
        // 期限超過した一時権限のログクリーニング（将来の拡張用）
      } catch (error) {
        console.error('Database cleanup error:', error);
      }
    }, 60000); // 1分ごとに実行

    // Botのステータスを設定
    client.user.setPresence({
      activities: [{
        name: '/knock で入室リクエスト',
        type: 0, // PLAYING
      }],
      status: 'online',
    });
  },
};
