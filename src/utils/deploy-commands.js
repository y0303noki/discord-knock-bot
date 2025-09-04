const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { discord } = require('../config/config');

const commands = [];

// commands ディレクトリからコマンドファイルを読み込む
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith('.js'))
  .filter(file => ['knock.js', 'help.js'].includes(file));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// REST APIでコマンドを登録
const rest = new REST({ version: '10' }).setToken(discord.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // ギルドスコープで登録（即時反映）
    const data = await rest.put(
      Routes.applicationGuildCommands(discord.clientId, discord.guildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);

    // 古いグローバルコマンドをクリア（残っていると古い仕様が見えるため）
    try {
      await rest.put(Routes.applicationCommands(discord.clientId), { body: [] });
      console.log('Cleared global application (/) commands.');
    } catch (clearErr) {
      console.warn('Warning: Failed to clear global commands (can be ignored if unused):', clearErr);
    }
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
})();
