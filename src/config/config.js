require('dotenv').config();

/**
 * 環境変数設定ガイド:
 * .envファイルを作成し、以下の値を設定してください:
 *
 * DISCORD_TOKEN=your_bot_token_here          # Discord Developer Portalから取得
 * CLIENT_ID=your_client_id_here              # Discord Application ID
 * GUILD_ID=your_guild_id_here               # サーバーID（オプション）
 * DB_PATH=./data/knock_requests.db          # データベースファイルパス
 * DEFAULT_KNOCK_TIMEOUT=300000              # ノック有効時間（ミリ秒）
 * MAX_CONCURRENT_REQUESTS=5                 # 同時リクエスト上限
 *
 * デフォルト設定:
 * - 承認権限: voice_connected (ボイスチャンネル接続者のみ)
 * - 権限有効時間: 5分
 * - リクエスト有効時間: 5分
 */

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
  },
  database: {
    path: process.env.DB_PATH || './data/knock_requests.db',
  },
  bot: {
    defaultKnockTimeout: parseInt(process.env.DEFAULT_KNOCK_TIMEOUT) || 300000, // 5分
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5,
  },
};
