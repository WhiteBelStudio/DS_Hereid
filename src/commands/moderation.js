const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const db = require("../database");
const { isFeatureEnabled } = require("../features");

const ACTION_LABELS = {
  warn: "Предупреждение",
  timeout: "Тайм-аут",
  untimeout: "Снятие тайм-аута",
  kick: "Кик",
  ban: "Бан",
  unban: "Разбан",
};

function isTrustedStaff(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.user.id === interaction.guild.ownerId ||
      (interaction.client.config?.ownerIds || []).includes(interaction.user.id) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const names = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.values()].map((role) => String(role.name || "").trim().toUpperCase())
    : [];
  if (names.some((name) => ["CHIEF TECH ADMIN", "ADMINISTRATOR", "HEAD MODERATOR"].includes(name))) return true;

  const roleIds = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.keys()]
    : [];
  if (!roleIds.length) return false;
  const placeholders = roleIds.map(() => "?").join(",");
  return Boolean(db.prepare(
    `SELECT 1 FROM admin_access_roles
     WHERE guild_id=? AND section IN ('moderation','all') AND role_id IN (${placeholders}) LIMIT 1`,
  ).get(interaction.guildId, ...roleIds));
}

function hasPermission(interaction, permission) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(permission) || isTrustedStaff(interaction));
}

function recordCase(guildId, targetId, moderatorId, action, reason, durationMinutes = null) {
  const result = db.prepare(
    "INSERT INTO moderation_cases (guild_id,target_id,moderator_id,action,reason,duration_minutes) VALUES (?,?,?,?,?,?)",
  ).run(guildId, targetId, moderatorId, action, reason, durationMinutes);
  db.prepare(
    "INSERT INTO admin_audit (guild_id,actor_id,action,target_id,details) VALUES (?,?,?,?,?)",
  ).run(guildId, moderatorId, `moderation_${action}`, targetId, reason.slice(0, 900));
  return Number(result.lastInsertRowid);
}

async function sendModLog(interaction, action, target, reason, durationMinutes = null, caseId = null) {
  const settings = db.prepare(
    "SELECT mod_log_channel_id FROM guild_settings WHERE guild_id=?",
  ).get(interaction.guildId);
  if (!settings?.mod_log_channel_id) return;

  const channel = await interaction.guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return;
  const fields = [
    { name: "Действие", value: ACTION_LABELS[action] || action, inline: true },
    { name: "Цель", value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
    { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Причина", value: reason.slice(0, 1024), inline: false },
  ];
  if (durationMinutes) fields.push({ name: "Длительность", value: `${durationMinutes} мин.`, inline: true });
  if (caseId) fields.push({ name: "Номер случая", value: `#${caseId}`, inline: true });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🛡️ Журнал модерации").addFields(fields).setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch((error) => interaction.client.logger?.warn?.("Could not send moderation log.", error));
}


async function notifyPunishedUser(interaction, action, target, reason, durationMinutes = null) {
  const now = Date.now();
  const expiry = action === "timeout" && durationMinutes
    ? Math.floor((now + durationMinutes * 60_000) / 1000)
    : null;
  const endText = action === "timeout"
    ? `Тайм-аут закончится: <t:${expiry}:F> ( <t:${expiry}:R> ).`
    : action === "warn"
      ? "Срок предупреждения не установлен. Оно останется в истории модерации, пока персонал не решит иначе."
      : action === "kick"
        ? "Кик не имеет таймера: ты сможешь вернуться, если сервер разрешает повторный вход и у тебя есть приглашение."
        : "Бан действует без установленного срока и закончится только после разбана администрацией.";
  const message = [
    `🛡️ **Ты получил наказание на сервере «${interaction.guild.name}».**`,
    `**Наказание:** ${ACTION_LABELS[action] || action}`,
    `**Причина:** ${reason}`,
    action === "timeout" ? `**Длительность:** ${durationMinutes} мин.` : "",
    endText,
    `**Модератор:** ${interaction.user.tag}`,
  ].filter(Boolean).join("\n");
  try {
    await target.send({ content: message, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    interaction.client.logger?.warn?.(`Could not DM punished user ${target.id}; their DMs may be closed.`);
    return false;
  }
}

async function applyAction(interaction, action, target, reason, durationMinutes = null) {
  if (!target) {
    return interaction.reply({ content: "⛔ Не удалось определить цель наказания.", flags: MessageFlags.Ephemeral });
  }
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "⛔ Нельзя наказать самого себя.", flags: MessageFlags.Ephemeral });
  }
  if (target.id === interaction.guild.ownerId) {
    return interaction.reply({ content: "⛔ Нельзя наказать владельца сервера.", flags: MessageFlags.Ephemeral });
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actor || member.roles.highest.position >= actor.roles.highest.position) {
      return interaction.reply({ content: "⛔ Нельзя наказать участника с равной или более высокой ролью.", flags: MessageFlags.Ephemeral });
    }
    if (member.id === interaction.client.user.id) {
      return interaction.reply({ content: "⛔ Бот не может применять наказания к самому себе.", flags: MessageFlags.Ephemeral });
    }
  }

  const botMember = await interaction.guild.members.fetchMe();
  if (action !== "warn" && member && member.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.reply({ content: "⛔ Роль цели находится выше или на одном уровне с ролью бота.", flags: MessageFlags.Ephemeral });
  }

  try {
    if (action === "warn") {
      // A warning is a persistent database case; it does not change Discord permissions.
    } else if (action === "timeout") {
      if (!member) return interaction.reply({ content: "Участник должен состоять на сервере для тайм-аута.", flags: MessageFlags.Ephemeral });
      if (!member.moderatable) return interaction.reply({ content: "Бот не может выдать тайм-аут. Проверь право «Модерировать участников» и иерархию ролей.", flags: MessageFlags.Ephemeral });
      await member.timeout(durationMinutes * 60_000, reason);
    } else if (action === "kick") {
      if (!member) return interaction.reply({ content: "Участник должен состоять на сервере для кика.", flags: MessageFlags.Ephemeral });
      if (!member.kickable) return interaction.reply({ content: "Бот не может кикнуть участника. Проверь право «Кикать участников» и иерархию ролей.", flags: MessageFlags.Ephemeral });
      await member.kick(reason);
    } else if (action === "ban") {
      if (member && !member.bannable) return interaction.reply({ content: "Бот не может забанить этого участника. Проверь право «Банить участников» и иерархию ролей.", flags: MessageFlags.Ephemeral });
      await interaction.guild.members.ban(target.id, { reason });
    } else {
      return interaction.reply({ content: "Неизвестный тип наказания.", flags: MessageFlags.Ephemeral });
    }

    const caseId = recordCase(interaction.guildId, target.id, interaction.user.id, action, reason, durationMinutes);
    await sendModLog(interaction, action, target, reason, durationMinutes, caseId);
    const dmSent = await notifyPunishedUser(interaction, action, target, reason, durationMinutes);
    const durationText = durationMinutes ? `\nДлительность: ${durationMinutes} мин.` : "";
    return interaction.reply({
      content: `✅ ${ACTION_LABELS[action]} применено.\nЦель: <@${target.id}>\nПричина: ${reason}${durationText}\nНомер случая: #${caseId}${dmSent ? "\n📩 Уведомление отправлено пользователю в личные сообщения." : "\n⚠️ Не удалось отправить уведомление в личные сообщения (возможно, они закрыты)."}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    interaction.client.logger?.error?.(`Moderation action failed: ${action}`, error);
    return interaction.reply({
      content: "⚠️ Discord не выполнил наказание. Проверь права бота, иерархию ролей и журнал запуска.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderation")
    .setDescription("Предупреждения, тайм-ауты, кики, баны и история наказаний.")
    .addSubcommand((s) => s.setName("warn").setDescription("Выдать предупреждение участнику.")
      .addUserOption((o) => o.setName("member").setDescription("Участник").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина наказания").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("timeout").setDescription("Ограничить участника на время.")
      .addUserOption((o) => o.setName("member").setDescription("Участник").setRequired(true))
      .addIntegerOption((o) => o.setName("minutes").setDescription("Длительность в минутах (1–40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина наказания").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("kick").setDescription("Исключить участника с сервера.")
      .addUserOption((o) => o.setName("member").setDescription("Участник").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина наказания").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("ban").setDescription("Заблокировать пользователя на сервере.")
      .addUserOption((o) => o.setName("member").setDescription("Пользователь").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина наказания").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("untimeout").setDescription("Снять тайм-аут с участника.")
      .addUserOption((o) => o.setName("member").setDescription("Участник").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина снятия").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("unban").setDescription("Разблокировать пользователя по ID.")
      .addStringOption((o) => o.setName("user_id").setDescription("Discord ID забаненного пользователя").setMinLength(17).setMaxLength(20).setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Причина разбана").setMaxLength(500).setRequired(true)))
    .addSubcommand((s) => s.setName("history").setDescription("Посмотреть последние наказания.")
      .addUserOption((o) => o.setName("member").setDescription("Фильтр по участнику").setRequired(false))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Команда доступна только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (!isFeatureEnabled(interaction.guildId, "moderation")) {
      return interaction.reply({ content: "🛑 Модерация отключена в настройках бота.", flags: MessageFlags.Ephemeral });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "history") {
      if (!hasPermission(interaction, PermissionFlagsBits.ViewAuditLog)) {
        return interaction.reply({ content: "⛔ Нет доступа к истории наказаний.", flags: MessageFlags.Ephemeral });
      }
      const target = interaction.options.getUser("member");
      const rows = target
        ? db.prepare("SELECT id,target_id,moderator_id,action,reason,created_at,duration_minutes FROM moderation_cases WHERE guild_id=? AND target_id=? ORDER BY id DESC LIMIT 10").all(interaction.guildId, target.id)
        : db.prepare("SELECT id,target_id,moderator_id,action,reason,created_at,duration_minutes FROM moderation_cases WHERE guild_id=? ORDER BY id DESC LIMIT 10").all(interaction.guildId);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🛡️ История наказаний")
        .setDescription(rows.length ? rows.map((r) => `**#${r.id} · ${ACTION_LABELS[r.action] || r.action}** — <@${r.target_id}>\nМодератор: <@${r.moderator_id}> · ${r.reason || "Причина не указана"}${r.duration_minutes ? ` · ${r.duration_minutes} мин.` : ""}\n<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`).join("\n\n").slice(0, 4000) : "Записей пока нет.");
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (subcommand === "untimeout") {
      if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: "⛔ Недостаточно прав. Нужны права «Модерировать участников» или доступ персонала к модерации.", flags: MessageFlags.Ephemeral });
      }
      const target = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason").trim();
      if (!reason) return interaction.reply({ content: "Укажи причину снятия тайм-аута.", flags: MessageFlags.Ephemeral });
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply({ content: "⛔ Этот пользователь не состоит на сервере.", flags: MessageFlags.Ephemeral });
      if (!member.isCommunicationDisabled()) {
        return interaction.reply({ content: "ℹ️ У этого участника сейчас нет тайм-аута.", flags: MessageFlags.Ephemeral });
      }
      const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const botMember = await interaction.guild.members.fetchMe().catch(() => null);
      if (!actor || member.roles.highest.position >= actor.roles.highest.position) {
        return interaction.reply({ content: "⛔ Нельзя снять тайм-аут с участника с равной или более высокой ролью.", flags: MessageFlags.Ephemeral });
      }
      if (!botMember || !member.moderatable || member.roles.highest.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: "⛔ Бот не может снять тайм-аут с этого участника. Проверь право «Модерировать участников» и иерархию ролей.", flags: MessageFlags.Ephemeral });
      }
      try {
        await member.timeout(null, reason);
        const caseId = recordCase(interaction.guildId, target.id, interaction.user.id, "untimeout", reason);
        await sendModLog(interaction, "untimeout", target, reason, null, caseId);
        return interaction.reply({
          content: `✅ Тайм-аут снят с <@${target.id}>.\nПричина: ${reason}\nНомер случая: #${caseId}`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        interaction.client.logger?.error?.("Failed to remove timeout.", error);
        return interaction.reply({ content: "⚠️ Не удалось снять тайм-аут. Проверь права бота и журнал запуска.", flags: MessageFlags.Ephemeral });
      }
    }

    if (subcommand === "unban") {
      if (!hasPermission(interaction, PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: "⛔ Недостаточно прав. Нужны права «Банить участников» или доступ персонала к модерации.", flags: MessageFlags.Ephemeral });
      }
      const userId = interaction.options.getString("user_id").trim();
      const reason = interaction.options.getString("reason").trim();
      if (!/^\d{17,20}$/.test(userId)) {
        return interaction.reply({ content: "⛔ Укажи корректный Discord ID пользователя (17–20 цифр).", flags: MessageFlags.Ephemeral });
      }
      if (!reason) return interaction.reply({ content: "Укажи причину разбана.", flags: MessageFlags.Ephemeral });
      const botMember = await interaction.guild.members.fetchMe().catch(() => null);
      if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: "⛔ Боту нужно право «Банить участников».", flags: MessageFlags.Ephemeral });
      }
      try {
        const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
        if (!ban) return interaction.reply({ content: "ℹ️ Пользователь с таким ID не найден среди забаненных.", flags: MessageFlags.Ephemeral });
        await interaction.guild.members.unban(userId, reason);
        const caseId = recordCase(interaction.guildId, userId, interaction.user.id, "unban", reason);
        await sendModLog(interaction, "unban", ban.user, reason, null, caseId);
        return interaction.reply({
          content: `✅ Пользователь <@${userId}> разбанен.\nПричина: ${reason}\nНомер случая: #${caseId}`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        interaction.client.logger?.error?.("Failed to unban user.", error);
        return interaction.reply({ content: "⚠️ Не удалось выполнить разбан. Проверь права бота и журнал запуска.", flags: MessageFlags.Ephemeral });
      }
    }

    const actionPermissions = {
      warn: PermissionFlagsBits.ModerateMembers,
      timeout: PermissionFlagsBits.ModerateMembers,
      kick: PermissionFlagsBits.KickMembers,
      ban: PermissionFlagsBits.BanMembers,
    };
    if (!hasPermission(interaction, actionPermissions[subcommand])) {
      return interaction.reply({ content: "⛔ Недостаточно прав для этого действия. Нужны соответствующие права Discord или роль персонала с доступом к модерации.", flags: MessageFlags.Ephemeral });
    }
    const target = interaction.options.getUser("member");
    const reason = interaction.options.getString("reason").trim();
    if (!reason) return interaction.reply({ content: "Укажи причину наказания.", flags: MessageFlags.Ephemeral });

    const durationMinutes = subcommand === "timeout" ? interaction.options.getInteger("minutes") : null;
    return applyAction(interaction, subcommand, target, reason, durationMinutes);
  },
};
