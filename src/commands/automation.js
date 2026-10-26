const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder,
} = require("discord.js");
const db = require("../database");
const { audit } = require("../automation");

function canManage(interaction) {
  return interaction.guild &&
    (interaction.user.id === interaction.guild.ownerId ||
     interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
     interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}
function formatDate(ms) {
  return new Date(ms).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName("automation")
    .setDescription("Управление автоматическими объявлениями HeradeLegend.")
    .addSubcommand((s) => s.setName("add").setDescription("Запланировать автоматическое объявление.")
      .addChannelOption((o) => o.setName("channel").setDescription("Текстовый канал для объявления").setRequired(true))
      .addStringOption((o) => o.setName("datetime").setDescription("Дата и время по Москве: YYYY-MM-DD HH:mm").setRequired(true))
      .addStringOption((o) => o.setName("message").setDescription("Текст объявления").setRequired(true).setMaxLength(1800)))
    .addSubcommand((s) => s.setName("list").setDescription("Показать запланированные объявления."))
    .addSubcommand((s) => s.setName("cancel").setDescription("Отменить запланированное объявление.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID задачи из /automation list").setRequired(true).setMinValue(1))),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Команда доступна только на сервере.", flags: MessageFlags.Ephemeral });
    if (!canManage(interaction)) return interaction.reply({ content: "⛔ Управлять автоматизацией могут владелец сервера и администраторы с правом «Управление сервером».", flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
      const channel = interaction.options.getChannel("channel", true);
      const raw = interaction.options.getString("datetime", true).trim();
      const message = interaction.options.getString("message", true).trim();
      if (!channel.isTextBased() || !channel.isSendable()) return interaction.reply({ content: "Выбери текстовый канал, в который бот может отправлять сообщения.", flags: MessageFlags.Ephemeral });
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
      if (!match) return interaction.reply({ content: "Неверный формат. Укажи дату и время как YYYY-MM-DD HH:mm по Москве, например 2026-12-31 18:30.", flags: MessageFlags.Ephemeral });
      const [, y, mo, d, h, mi] = match.map(Number);
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return interaction.reply({ content: "Дата или время вне допустимого диапазона.", flags: MessageFlags.Ephemeral });
      // Moscow is UTC+3; construct UTC timestamp explicitly to avoid host timezone differences.
      const scheduledAt = Date.UTC(y, mo - 1, d, h - 3, mi);
      const check = new Date(scheduledAt + 3 * 60 * 60 * 1000);
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d ||
          check.getUTCHours() !== h || check.getUTCMinutes() !== mi || scheduledAt <= Date.now() + 60_000) {
        return interaction.reply({ content: "Дата некорректна или слишком близко. Укажи существующее время минимум через 1 минуту.", flags: MessageFlags.Ephemeral });
      }
      const result = db.prepare("INSERT INTO scheduled_tasks (guild_id, channel_id, creator_id, task_type, payload, scheduled_at) VALUES (?, ?, ?, 'announcement', ?, ?)")
        .run(interaction.guildId, channel.id, interaction.user.id, message, scheduledAt);
      audit(interaction.guildId, interaction.user.id, "automation_scheduled", String(result.lastInsertRowid), `channel=${channel.id}; at=${scheduledAt}`);
      return interaction.reply({ content: `✅ Объявление #${result.lastInsertRowid} запланировано в ${channel} на **${formatDate(scheduledAt)}** (время Москвы). Бот должен оставаться запущенным к этому времени.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "list") {
      const tasks = db.prepare("SELECT id, channel_id, payload, scheduled_at, status FROM scheduled_tasks WHERE guild_id=? AND status='pending' ORDER BY scheduled_at ASC LIMIT 20").all(interaction.guildId);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("⏰ Автоматические объявления")
        .setDescription(tasks.length ? tasks.map((t) => `**#${t.id}** · <#${t.channel_id}> · ${formatDate(t.scheduled_at)} МСК\n${t.payload.slice(0, 160)}`).join("\n\n").slice(0, 4000) : "Активных задач нет.")
        .setFooter({ text: "Показаны ближайшие 20 задач. Все даты указаны по Москве." });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === "cancel") {
      const id = interaction.options.getInteger("id", true);
      const result = db.prepare("UPDATE scheduled_tasks SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=? AND status='pending'").run(id, interaction.guildId);
      if (!result.changes) return interaction.reply({ content: "Активная задача с таким ID не найдена.", flags: MessageFlags.Ephemeral });
      audit(interaction.guildId, interaction.user.id, "automation_cancelled", String(id), "Плановое объявление отменено");
      return interaction.reply({ content: `✅ Объявление #${id} отменено.`, flags: MessageFlags.Ephemeral });
    }
  },
};
