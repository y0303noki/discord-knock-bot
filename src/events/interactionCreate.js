const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/init');
const PermissionManager = require('../utils/permissions');
const { bot } = require('../config/config');

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

    case 'approve':
      await handleApproveCommand(interaction);
      break;

    case 'deny':
      await handleDenyCommand(interaction);
      break;

    case 'set_private':
      await handleSetPrivateCommand(interaction);
      break;

    case 'set_public':
      await handleSetPublicCommand(interaction);
      break;

    case 'set_approval_mode':
      await handleSetApprovalModeCommand(interaction);
      break;

    case 'batch_set_voice_mode':
      await handleBatchSetVoiceModeCommand(interaction);
      break;

    case 'debug_perms':
      await handleDebugPermsCommand(interaction);
      break;

    default:
      await interaction.reply({
        content: '不明なコマンドです。',
        ephemeral: true
      });
  }
}

async function handleKnockCommand(interaction) {
  const channel = interaction.options.getChannel('channel');
  const timeout = interaction.options.getInteger('timeout') || bot.defaultKnockTimeout;

  // ボイスチャンネルかチェック
  if (!channel || channel.type !== 2) { // GUILD_VOICE
    return await interaction.reply({
      content: 'ボイスチャンネルを指定してください。',
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

async function handleApproveCommand(interaction) {
  const requestId = interaction.options.getInteger('request_id');

  try {
    const approved = await db.approveKnockRequest(requestId, interaction.user.id);

    if (!approved) {
      return await interaction.reply({
        content: 'リクエストが見つからないか、既に処理されています。',
        ephemeral: true
      });
    }

    // 承認メッセージを送信
    await interaction.reply({
      content: `✅ リクエスト #${requestId} を承認しました。`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Approve command error:', error);
    await interaction.reply({
      content: '承認処理中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

async function handleDenyCommand(interaction) {
  const requestId = interaction.options.getInteger('request_id');

  // 実際の実装ではデータベースからリクエストを削除または拒否状態に更新
  await interaction.reply({
    content: `❌ リクエスト #${requestId} を拒否しました。`,
    ephemeral: true
  });
}

async function handleSetPrivateCommand(interaction) {
  const channel = interaction.options.getChannel('channel');

  if (!channel || channel.type !== 2) {
    return await interaction.reply({
      content: 'ボイスチャンネルを指定してください。',
      ephemeral: true
    });
  }

  try {
    await permissionManager.setChannelPrivate(channel.id);
    await interaction.reply({
      content: `🔒 **${channel.name}** をプライベートモードに設定しました。`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Set private error:', error);
    await interaction.reply({
      content: 'チャンネルの設定中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

async function handleSetPublicCommand(interaction) {
  const channel = interaction.options.getChannel('channel');

  if (!channel || channel.type !== 2) {
    return await interaction.reply({
      content: 'ボイスチャンネルを指定してください。',
      ephemeral: true
    });
  }

  try {
    await permissionManager.setChannelPublic(channel.id);
    await interaction.reply({
      content: `🔓 **${channel.name}** をパブリックモードに設定しました。`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Set public error:', error);
    await interaction.reply({
      content: 'チャンネルの設定中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

async function handleSetApprovalModeCommand(interaction) {
  const channel = interaction.options.getChannel('channel');
  const mode = interaction.options.getString('mode');
  const role = interaction.options.getRole('role');

  if (!channel || channel.type !== 2) {
    return await interaction.reply({
      content: 'ボイスチャンネルを指定してください。',
      ephemeral: true
    });
  }

  // 管理者権限チェック
  if (!interaction.member.permissions.has('ManageChannels')) {
    return await interaction.reply({
      content: 'チャンネルを管理する権限がありません。',
      ephemeral: true
    });
  }

  // ロール指定モードでロールが指定されていない場合
  if (mode === 'role_based' && !role) {
    return await interaction.reply({
      content: 'ロール指定モードではロールを指定してください。',
      ephemeral: true
    });
  }

  try {
    // 現在のトピックを取得
    let currentTopic = channel.topic || '';

    // 既存のノック設定を削除
    currentTopic = currentTopic.replace(/\[knock:[^\]]+\]/g, '').trim();

    // 新しい設定を追加
    let newSetting = `[knock:${mode}`;
    if (mode === 'role_based' && role) {
      newSetting += `:${role.id}`;
    }
    newSetting += ']';

    // トピックを更新
    const updatedTopic = currentTopic ? `${currentTopic} ${newSetting}` : newSetting;

    await channel.setTopic(updatedTopic);

    const modeDescriptions = {
      'channel_member': 'チャンネルメンバー全員',
      'voice_connected': 'ボイス接続者のみ',
      'role_based': `ロール「${role.name}」を持つ人のみ`
    };

    await interaction.reply({
      content: `✅ **${channel.name}** の承認権限を **${modeDescriptions[mode]}** に設定しました。`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Set approval mode error:', error);
    await interaction.reply({
      content: '承認モードの設定中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

async function handleBatchSetVoiceModeCommand(interaction) {
  const confirm = interaction.options.getBoolean('confirm');

  if (!confirm) {
    return await interaction.reply({
      content: '⚠️ 実行をキャンセルしました。確認のため `confirm: true` を指定してください。',
      ephemeral: true
    });
  }

  // 管理者権限チェック
  if (!interaction.member.permissions.has('ManageChannels')) {
    return await interaction.reply({
      content: 'チャンネルを管理する権限がありません。',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    const voiceChannels = guild.channels.cache.filter(channel =>
      channel.type === 2 // GUILD_VOICE
    );

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const [channelId, channel] of voiceChannels) {
      try {
        // 現在のトピックを取得
        let currentTopic = channel.topic || '';

        // 既存のノック設定を削除
        currentTopic = currentTopic.replace(/\[knock:[^\]]+\]/g, '').trim();

        // 新しい設定を追加
        const newSetting = '[knock:voice_connected]';
        const updatedTopic = currentTopic ? `${currentTopic} ${newSetting}` : newSetting;

        // トピックを更新
        await channel.setTopic(updatedTopic);

        successCount++;
        results.push(`✅ ${channel.name}`);

      } catch (error) {
        console.error(`Failed to update channel ${channel.name}:`, error);
        failCount++;
        results.push(`❌ ${channel.name} (権限不足)`);
      }
    }

    const summary = `📊 **一括設定完了**\n\n` +
      `✅ 成功: ${successCount}チャンネル\n` +
      `❌ 失敗: ${failCount}チャンネル\n\n` +
      `**設定されたチャンネル:**\n${results.slice(0, 10).join('\n')}` +
      (results.length > 10 ? `\n...他${results.length - 10}チャンネル` : '');

    await interaction.editReply({
      content: summary
    });

  } catch (error) {
    console.error('Batch set voice mode error:', error);
    await interaction.editReply({
      content: '一括設定中にエラーが発生しました。'
    });
  }
}

async function handleDebugPermsCommand(interaction) {
  const target = interaction.options.getChannel('channel');

  if (!target) {
    return await interaction.reply({ content: 'チャンネルを指定してください。', ephemeral: true });
  }

  try {
    const me = interaction.guild.members.me;
    const perms = target.permissionsFor(me);

    if (!perms) {
      return await interaction.reply({ content: 'このチャンネルの権限を取得できません。', ephemeral: true });
    }

    const wanted = [
      'ViewChannel',
      'ManageChannels',
      'Connect',
      'Speak',
      'ManageRoles',
    ];

    const lines = wanted.map(k => `- ${k}: ${perms.has(k) ? '✅' : '❌'}`);

    await interaction.reply({
      content: `権限（${target.name}）\n` + lines.join('\n'),
      ephemeral: true,
    });
  } catch (e) {
    console.error('debug_perms error:', e);
    await interaction.reply({ content: '権限の取得中にエラーが発生しました。', ephemeral: true });
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
