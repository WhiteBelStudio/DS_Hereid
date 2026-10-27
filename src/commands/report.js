const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder,
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const db = require("../database");

const CATEGORIES = [
  { name: "Нарушение правил", value: "rules", label: "Нарушение правил" },
  { name: "Оскорбления или травля", value: "harassment", label: "Оскорбления или травля" },
  { name: "Спам или реклама", value: "spam", label: "Спам или реклама" },
  { name: "Проблема с участником", value: "member", label: "Проблема с участником" },
  { name: "Другое", value: "other", label: "Другое" },
];
const STAFF_ROLE_NAMES = new Set(["CHIEF TECH ADMIN", "TECH ADMIN", "ADMINISTRATOR", "HEAD MODERATOR", "SUPPORT"]);
// Public report feed requested by the server owner.
const PUBLIC_REPORT_CHANNEL_ID = "1564742933872377907";

async function fetchReportChannel(guild) {
  if (!guild) return null;
  const channel = await guild.channels.fetch(PUBLIC_REPORT_CHANNEL_ID).catch(() => null);
  return channel && channel.isTextBased() && channel.isSendable() ? channel : null;
}

function isStaff(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  const roles = interaction.member?.roles?.cache;
  return Boolean(roles && [...roles.values()].some((role) =>
    STAFF_ROLE_NAMES.has(String(role.name || "").trim().toUpperCase())));
}

function audit(guildId, actorId, action, reportId, details = "") {
  // Audit history is best-effort: a legacy audit-table schema must never make
  // a user's report submission fail after the report itself was saved.
  try {
    db.prepare("INSERT INTO admin_audit (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
      .run(guildId, actorId, action, String(reportId), String(details).slice(0, 900));
  } catch (error) {
    console.error("[report] Could not write admin audit record:", error);
  }
}

function reportEmbed(report, reporterLabel, targetLabel) {
  const category = CATEGORIES.find((item) => item.value === report.category)?.label || report.category;
  const embed = new EmbedBuilder()
    .setColor(report.status === "open" ? 0xed4245 : 0x57f287)
    .setTitle("🛡️ Репорт #" + report.id + " · " + category)
    .setDescription(report.description.slice(0, 4000))
    .addFields(
      { name: "Отправитель", value: reporterLabel || "<@" + report.reporter_id + ">", inline: true },
      { name: "На кого жалоба", value: report.target_id ? (targetLabel || "<@" + report.target_id + ">") : "Не указан", inline: true },
      { name: "Статус", value: report.status === "open" ? "🟠 Ожидает рассмотрения" : "✅ Рассмотрен", inline: true },
      { name: "Доказательства", value: report.evidence_url || "Не приложены", inline: false },
    )
    .setFooter({ text: "HeradeLegend · ID репорта: " + report.id });
  if (report.status === "resolved") {
    embed.addFields(
      { name: "Рассмотрел", value: report.handled_by ? "<@" + report.handled_by + ">" : "—", inline: true },
      { name: "Решение", value: (report.resolution || "Не указано").slice(0, 1024), inline: false },
    );
  }
  return embed;
}

async function submitReport(interaction) {
  const category = interaction.options.getString("category", true);
  const target = interaction.options.getUser("target");
  if (target && target.bot) return interaction.reply({ content: "Репорт на бота отправить нельзя. Сообщи о проблеме администрации сервера.", flags: MessageFlags.Ephemeral });
  if (target && target.id === interaction.user.id) return interaction.reply({ content: "Нельзя отправить репорт на самого себя.", flags: MessageFlags.Ephemeral });

  const channel = await fetchReportChannel(interaction.guild);
  if (!channel) {
    return interaction.reply({ content: "⚠️ Не удалось открыть публичный канал репортов. Проверь, что канал существует и у бота есть права «Просмотр канала» и «Отправка сообщений».", flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder().setCustomId("rp:submit:" + category + ":" + (target ? target.id : "none")).setTitle("Отправить репорт");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("description").setLabel("Что произошло?")
        .setPlaceholder("Опиши ситуацию спокойно и по фактам")
        .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1800).setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("evidence").setLabel("Ссылка на доказательство (необязательно)")
        .setPlaceholder("https://... — ссылка на сообщение или скриншот")
        .setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(false),
    ),
  );
  await interaction.showModal(modal);
}

async function configureChannel(interaction) {
  if (!isStaff(interaction)) return interaction.reply({ content: "⛔ Настраивать репорты может только администрация и персонал поддержки.", flags: MessageFlags.Ephemeral });
  const channel = interaction.options.getChannel("channel", true);
  if (channel.id !== PUBLIC_REPORT_CHANNEL_ID) {
    return interaction.reply({ content: "ℹ️ Публичный канал репортов закреплён за <#" + PUBLIC_REPORT_CHANNEL_ID + ">. Выбери именно его — тогда все репорты будут публиковаться в одном месте.", flags: MessageFlags.Ephemeral });
  }
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || !channel.isSendable()) {
    return interaction.reply({ content: "Выбери доступный текстовый канал.", flags: MessageFlags.Ephemeral });
  }
  db.prepare("INSERT INTO guild_settings (guild_id, report_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET report_channel_id=excluded.report_channel_id, updated_at=CURRENT_TIMESTAMP")
    .run(interaction.guildId, channel.id);
  audit(interaction.guildId, interaction.user.id, "report_channel_configured", channel.id, "Публичный канал репортов подтверждён");
  return interaction.reply({ content: "✅ Публичный канал репортов подтверждён: <#" + PUBLIC_REPORT_CHANNEL_ID + ">. Репорты будут видны участникам сервера.", flags: MessageFlags.Ephemeral });
}

async function listReports(interaction) {
  if (!isStaff(interaction)) return interaction.reply({ content: "⛔ Список репортов доступен только персоналу.", flags: MessageFlags.Ephemeral });
  const reports = db.prepare("SELECT * FROM reports WHERE guild_id=? AND status='open' ORDER BY id DESC LIMIT 12").all(interaction.guildId);
  const embed = new EmbedBuilder().setColor(0xed4245).setTitle("🛡️ Открытые репорты")
    .setDescription(reports.length ? reports.map((report) => {
      const category = CATEGORIES.find((item) => item.value === report.category)?.label || report.category;
      return "**#" + report.id + " · " + category + "**\nОтправитель: <@" + report.reporter_id + "> · На кого: " +
        (report.target_id ? "<@" + report.target_id + ">" : "не указан") + "\nСоздан: " + report.created_at;
    }).join("\n\n").slice(0, 4000) : "Открытых репортов нет.");
  embed.setFooter({ text: "Рассмотреть репорт: /report resolve id:<ID> resolution:<решение>" });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function resolveReport(interaction) {
  if (!isStaff(interaction)) return interaction.reply({ content: "⛔ Рассматривать репорты может только персонал.", flags: MessageFlags.Ephemeral });
  const id = interaction.options.getInteger("id", true);
  const resolution = interaction.options.getString("resolution", true).trim();
  const report = db.prepare("SELECT * FROM reports WHERE id=? AND guild_id=?").get(id, interaction.guildId);
  if (!report) return interaction.reply({ content: "Репорт #" + id + " не найден.", flags: MessageFlags.Ephemeral });
  if (report.status === "resolved") return interaction.reply({ content: "Репорт #" + id + " уже рассмотрен: " + (report.resolution || "решение не указано") + ".", flags: MessageFlags.Ephemeral });
  const update = db.prepare("UPDATE reports SET status='resolved', handled_by=?, resolution=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'")
    .run(interaction.user.id, resolution, id);
  if (!update.changes) return interaction.reply({ content: "Репорт #" + id + " уже был рассмотрен другим модератором.", flags: MessageFlags.Ephemeral });
  audit(interaction.guildId, interaction.user.id, "report_resolved", id, resolution);
  const updated = db.prepare("SELECT * FROM reports WHERE id=?").get(id);
  const channel = await fetchReportChannel(interaction.guild);
  if (channel) {
    await channel.send({ embeds: [reportEmbed(updated)] }).catch((error) => interaction.client.logger?.warn?.("Could not post report resolution update: " + (error.message || error)));
  }
  const reporter = await interaction.client.users.fetch(report.reporter_id).catch(() => null);
  if (reporter) {
    await reporter.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Репорт #" + id + " рассмотрен")
      .setDescription(resolution).addFields({ name: "Категория", value: CATEGORIES.find((item) => item.value === report.category)?.label || report.category })] }).catch(() => {});
  }
  return interaction.reply({ content: "✅ Репорт #" + id + " отмечен как рассмотренный. Решение сохранено в базе данных.", flags: MessageFlags.Ephemeral });
}

async function handleModal(interaction) {
  const match = (interaction.customId || "").match(/^rp:submit:(rules|harassment|spam|member|other):(none|\d{17,20})$/);
  if (!match) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Репорты доступны только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const category = match[1];
  const targetId = match[2] === "none" ? null : match[2];
  const description = interaction.fields.getTextInputValue("description").trim();
  const evidenceRaw = interaction.fields.getTextInputValue("evidence").trim();
  if (description.length < 10) {
    await interaction.reply({ content: "Опиши ситуацию подробнее — минимум 10 символов.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (targetId === interaction.user.id) {
    await interaction.reply({ content: "Нельзя отправить репорт на самого себя.", flags: MessageFlags.Ephemeral });
    return true;
  }
  let evidenceUrl = null;
  if (evidenceRaw) {
    try {
      const parsed = new URL(evidenceRaw);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
      evidenceUrl = parsed.toString();
    } catch {
      await interaction.reply({ content: "Ссылка должна начинаться с https:// или http://.", flags: MessageFlags.Ephemeral });
      return true;
    }
  }
  const result = db.prepare("INSERT INTO reports (guild_id, reporter_id, target_id, category, description, evidence_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(interaction.guildId, interaction.user.id, targetId, category, description, evidenceUrl);
  const report = db.prepare("SELECT * FROM reports WHERE id=?").get(result.lastInsertRowid);
  const channel = await fetchReportChannel(interaction.guild);
  let delivered = false;
  if (channel && channel.isTextBased() && channel.isSendable()) {
    try {
      await channel.send({
        embeds: [reportEmbed(report, interaction.user.tag + " (" + interaction.user.id + ")", targetId ? "<@" + targetId + ">" : "Не указан")],
        allowedMentions: { parse: [] },
      });
      delivered = true;
    } catch (error) {
      interaction.client.logger?.error?.("Report was saved but could not be delivered to the report channel.", error);
    }
  }
  audit(interaction.guildId, interaction.user.id, "report_created", report.id, "category=" + category + "; target=" + (targetId || "none") + "; delivered=" + delivered);
  await interaction.reply({
    content: delivered
      ? "✅ Репорт #" + report.id + " отправлен персоналу. Спасибо, что сообщил о ситуации. Не отправляй дубликаты — команда рассмотрит обращение."
      : "⚠️ Репорт #" + report.id + " сохранён, но уведомить персонал не удалось. Попроси администрацию проверить канал репортов.",
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Отправить или обработать репорт на сервере.")
    .addSubcommand((sub) => sub.setName("submit").setDescription("Сообщить о нарушении или проблеме.")
      .addStringOption((option) => option.setName("category").setDescription("Категория репорта").setRequired(true)
        .addChoices(...CATEGORIES.map(({ name, value }) => ({ name, value }))))
      .addUserOption((option) => option.setName("target").setDescription("Участник, на которого жалоба (необязательно)").setRequired(false)))
    .addSubcommand((sub) => sub.setName("setup").setDescription("Настроить канал для репортов.")
      .addChannelOption((option) => option.setName("channel").setDescription("Приватный канал для персонала").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("Показать открытые репорты (персонал)."))
    .addSubcommand((sub) => sub.setName("resolve").setDescription("Отметить репорт рассмотренным.")
      .addIntegerOption((option) => option.setName("id").setDescription("ID репорта").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("resolution").setDescription("Итог рассмотрения").setMinLength(3).setMaxLength(500).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Команда доступна только на сервере Discord.", flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "submit") return submitReport(interaction);
    if (subcommand === "setup") return configureChannel(interaction);
    if (subcommand === "list") return listReports(interaction);
    if (subcommand === "resolve") return resolveReport(interaction);
    return interaction.reply({ content: "Неизвестное действие репорта.", flags: MessageFlags.Ephemeral });
  },
  handleModal,
  isStaff,
  reportEmbed,
  CATEGORIES,
};
