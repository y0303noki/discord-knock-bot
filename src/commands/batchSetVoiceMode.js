const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('batch_set_voice_mode')
    .setDescription('サーバー内の全ボイスチャンネルを「ボイス接続者のみ」承認モードに設定します')
    .addBooleanOption(option =>
      option
        .setName('confirm')
        .setDescription('実行を確認します')
        .setRequired(true)
    ),

  async execute(interaction) {
    // 実際の処理は events/interactionCreate.js で行われる
  },
};
