const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/init');
const PermissionManager = require('../utils/permissions');
const { bot } = require('../config/config');
const preapproveCommand = require('../commands/preapprove'); // preapproveコマンドをインポート

let permissionManager = null;

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // PermissionManagerの初期化（一度だけ）
    if (!permissionManager) {
      permissionManager = new PermissionManager(interaction.client);
    }

    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    }

    // ボタンインタラクションの処理
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }
  },
};

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'knock':
      await handleKnockCommand(interaction);
      break;
    case 'help':
      await handleHelpCommand(interaction);
      break;

    case 'preapprove': // 新しい 'preapprove' コマンドを追加
      // コマンド実行者が対象ボイスチャンネルに接続しているか確認
      const currentVoiceState = interaction.member.voice;
      const voiceChannelId = bot.allowedVoiceChannelId;

      if (!voiceChannelId) {
        await interaction.reply({
          content: '許可されたボイスチャンネルが設定されていません。Botのconfig.jsを確認してください。',
          ephemeral: true
        });
        return;
      }
      
      if (!currentVoiceState || currentVoiceState.channelId !== voiceChannelId) {
        await interaction.reply({
          content: `このコマンドは、固定のボイスチャンネル (<#${voiceChannelId}>) に接続している場合のみ使用できます。`,
          ephemeral: true
        });
        return;
      }
      await preapproveCommand.execute(interaction);
      break;

    default:
      await interaction.reply({
        content: '不明なコマンドです。',
        ephemeral: true
      });
  }
}

async function handleKnockCommand(interaction) {
  const timeout = interaction.options.getInteger('timeout') || bot.defaultKnockTimeout;
  const targetChannelId = bot.allowedVoiceChannelId;
  const channel = targetChannelId ? await interaction.client.channels.fetch(targetChannelId).catch(() => null) : null;

  // ボイスチャンネルかチェック
  if (!channel || channel.type !== 2) { // GUILD_VOICE
    return await interaction.reply({
      content: 'ボイスチャンネルを指定してください。',
      ephemeral: true
    });
  }

  // 許可されたチャンネルのみ許容
  if (bot.allowedVoiceChannelId && channel.id !== bot.allowedVoiceChannelId) {
    return await interaction.reply({
      content: 'このチャンネルでは /knock は使用できません。',
      ephemeral: true
    });
  }

  // コマンドを実行できるテキストチャンネルを制限
  if (bot.allowedTextChannelId && interaction.channelId !== bot.allowedTextChannelId) {
    return await interaction.reply({
      content: 'このテキストチャンネルでは /knock は使用できません。',
      ephemeral: true
    });
  }

  // 既に接続権限があるかチェック
  const hasPermission = await permissionManager.checkVoicePermission(channel.id, interaction.user.id);
  if (hasPermission) {
    return await interaction.reply({
      content: '既にこのチャンネルへの接続権限があります。',
      ephemeral: true
    });
  }

  // チャンネルが空なら、承認なしで一時権限を付与して即時入室可能にする
  try {
    const fetchedChannel = await interaction.client.channels.fetch(channel.id);
    if (fetchedChannel && fetchedChannel.type === 2 && fetchedChannel.members.size === 0) {
      await permissionManager.grantVoicePermission(channel.id, interaction.user.id, bot.defaultKnockTimeout);
      try {
        // 空のチャンネルに直接入室した場合も 'voice_connect' として記録し、
        // 退室後の revokeAfterExitMs を適用できるようにする
        await db.createPermissionGrant(channel.id, interaction.user.id, 'voice_connect', bot.defaultKnockTimeout);
      } catch (e) {
        console.error('Failed to record permission grant (empty channel fast-track):', e);
      }
      return await interaction.reply({
        content: `👋 現在このチャンネルは空です。承認なしで入室できるようにしました。`,
        ephemeral: true
      });
    }
  } catch (e) {
    console.error('Empty-channel fast-track check failed:', e);
  }

  // 既存のリクエストがあっても開発用途で続行できるように許可
  // 本番でブロックしたい場合はこの条件分岐で早期returnする
  const existingRequest = await db.getKnockRequest(channel.id, interaction.user.id);

  try {
    // 応答タイムアウト回避
    await interaction.deferReply({ ephemeral: true });
    // データベースにリクエストを作成
    const requestId = await db.createKnockRequest(
      interaction.user.id,
      interaction.user.username,
      channel.id,
      interaction.guild.id,
      timeout
    );

    // 埋め込みメッセージを作成
    const embed = new EmbedBuilder()
      .setTitle('🚪 入室リクエスト')
      .setDescription(`${interaction.user} さんが **${channel.name}** への入室を希望しています。`)
      .addFields(
        { name: 'リクエストID', value: requestId.toString(), inline: true },
        { name: '有効期限', value: `<t:${Math.floor((Date.now() + timeout) / 1000)}:R>`, inline: true }
      )
      .setColor(0x3498db)
      .setTimestamp();

    // 承認・拒否ボタンを作成
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${requestId}`)
          .setLabel('✅ 承認')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny_${requestId}`)
          .setLabel('❌ 拒否')
          .setStyle(ButtonStyle.Danger)
      );

    // 実行したテキストチャンネルに通知（ボイスチャンネルは投稿不可のため）
    const targetTextChannel = interaction.channel;
    await targetTextChannel.send({ embeds: [embed], components: [buttons] });

    await interaction.editReply({
      content: `✅ **${channel.name}** への入室リクエストを送信しました。`
    });

  } catch (error) {
    console.error('Knock command error:', error);
    try {
      await interaction.editReply({
        content: 'リクエストの送信中にエラーが発生しました。'
      });
    } catch (_) {
      // ignore
    }
  }
}

async function handleButtonInteraction(interaction) {
  const [action, requestId] = interaction.customId.split('_');

  try {
    // リクエスト情報を取得し、対象のボイスチャンネルIDを特定
    const requestForChannel = await db.getKnockRequestById(requestId);

    if (!requestForChannel) {
      return await interaction.reply({
        content: 'このリクエストは見つかりませんでした。',
        ephemeral: true
      });
    }

    const targetVoiceChannelId = requestForChannel.channel_id;

    // 対象ボイスチャンネルの承認設定を取得
    const channelSettings = await permissionManager.getChannelApprovalSettings(targetVoiceChannelId);

    if (!channelSettings) {
      return await interaction.reply({
        content: 'チャンネル設定の取得に失敗しました。',
        ephemeral: true
      });
    }

    // 承認権限をチェック
    const hasPermission = await permissionManager.checkApprovalPermission(
      targetVoiceChannelId,
      interaction.user.id,
      channelSettings.permissionType,
      channelSettings.allowedRoles
    );

    if (!hasPermission) {
      const permissionMessage = getPermissionErrorMessage(channelSettings.permissionType);
      return await interaction.reply({
        content: permissionMessage,
        ephemeral: true
      });
    }

    if (action === 'approve') {
      const approved = await db.approveKnockRequest(requestId, interaction.user.id);

      if (!approved) {
        return await interaction.reply({
          content: 'このリクエストは既に処理されています。',
          ephemeral: true
        });
      }

      // 権限を付与
      try {
        await permissionManager.grantVoicePermission(
          requestForChannel.channel_id,
          requestForChannel.requester_id, // リクエスタに権限を付与
          bot.defaultKnockTimeout
        );
        // 付与をDBに記録
        try {
          // ボタンからの承認も 'voice_connect' として記録し、
          // 退室後の revokeAfterExitMs を適用できるようにする
          await db.createPermissionGrant(requestForChannel.channel_id, requestForChannel.requester_id, 'voice_connect', bot.defaultKnockTimeout);
        } catch (e) {
          console.error('Failed to record permission grant:', e);
        }
      } catch (err) {
        if (err?.code === 50013) {
          return await interaction.reply({
            content: '権限付与に失敗しました（Botの権限不足）。チャンネルまたは親カテゴリでBotに「チャンネルの管理」を付与してください。',
            ephemeral: true
          });
        }
        throw err;
      }

      // ボタンを無効化
      const disabledButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('approved')
            .setLabel('✅ 承認済み')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('denied')
            .setLabel('❌ 拒否')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

      await interaction.update({
        content: `✅ **${interaction.user.username}** によって承認されました！`,
        components: [disabledButtons]
      });

    } else if (action === 'deny') {
      // 拒否されたリクエストの情報を取得
      const request = await db.getKnockRequestById(requestId);

      if (!request) {
        return await interaction.reply({
          content: 'このリクエストは既に処理されているか、見つかりません。',
          ephemeral: true
        });
      }

      // データベースでリクエストを拒否状態に更新（将来の拡張用）
      // 現在はログとして記録するのみ

      // ボタンを無効化
      const disabledButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('approved')
            .setLabel('✅ 承認')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('denied')
            .setLabel('❌ 拒否済み')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

      await interaction.update({
        content: `❌ **${interaction.user.username}** によって拒否されました。`,
        components: [disabledButtons]
      });
    }

  } catch (error) {
    console.error('Button interaction error:', error);
    await interaction.reply({
      content: '処理中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

async function handleHelpCommand(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('🚪 Knock Knock Botの使い方')
    .setDescription('このBotは、プライベートなボイスチャンネルへの入室を管理します。')
    .addFields(
      { name: '`/knock`', value: '指定されたボイスチャンネルへの入室リクエストを送信します。チャンネルに誰もいない場合は、承認なしで入室できます。' },
      { name: '`/preapprove`', value: '（VC接続者限定）指定したユーザーに、ノックなしで一時的に入室できる権限を付与します。' },
      { name: '`/help`', value: 'このヘルプメッセージを表示します。' }
    )
    .setTimestamp()
    .setFooter({ text: 'Knock Knock Bot' });

  await interaction.reply({
    embeds: [helpEmbed],
    ephemeral: true
  });
}

/**
 * 権限エラーのメッセージを取得
 * @param {string} permissionType - 権限タイプ
 */
function getPermissionErrorMessage(permissionType) {
  switch (permissionType) {
    case 'channel_member':
      return 'このチャンネルのメンバーのみがリクエストを承認できます。';
    case 'voice_connected':
      return 'ボイスチャンネルに接続している人のみがリクエストを承認できます。';
    case 'role_based':
      return '特定のロールを持つ人のみがリクエストを承認できます。';
    default:
      return 'このリクエストを承認する権限がありません。';
  }
}
