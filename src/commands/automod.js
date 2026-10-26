const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require("discord.js");
const db = require("../database");
const automod = require("../automod");

function canManage(interaction) {
  return interaction.guild && (
    interaction.user.id === interaction.guild.ownerId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}
function audit(interaction, action, details = "") {
  automod.audit(interaction.guildId, interaction.user.id, action, null, details);
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Настройка автоматической модерации HeradeLegend.")
    .addSubcommand((s) => s.setName("status").setDescription("Показать текущие фильтры."))
    .addSubcommand((s) => s.setName("log-channel").setDescription("Установить канал журнала автоматической модерации.")
      .addChannelOption((o) => o.setName("channel").setDescription("Канал для журнала").setRequired(true)))
    .addSubcommand((s) => s.setName("word-add").setDescription("Добавить запрещённое слово или фразу.")
      .addStringOption((o) => o.setName("term").setDescription("Слово или фраза").setRequired(true).setMaxLength(80)))
    .addSubcommand((s) => s.setName("word-remove").setDescription("Удалить слово или фразу из фильтра.")
      .addStringOption((o) => o.setName("term").setDescription("Точное слово или фраза").setRequired(true).setMaxLength(80)))
    .addSubcommand((s) => s.setName("exempt-add").setDescription("Исключить канал из автоматических фильтров.")
      .addChannelOption((o) => o.setName("channel").setDescription("Канал-исключение").setRequired(true)))
    .addSubcommand((s) => s.setName("exempt-remove").setDescription("Убрать исключение канала.")
      .addChannelOption((o) => o.setName("channel").setDescription("Канал").setRequired(true)))
    .addSubcommand((s) => s.setName("mentions-limit").setDescription("Установить лимит упоминаний в сообщении.")
      .addIntegerOption((o) => o.setName("count").setDescription("От 3 до 20").setMinValue(3).setMaxValue(20).setRequired(true)))
    .addSubcommand((s) => s.setName("links").setDescription("Включить или отключить фильтр обычных ссылок.")
      .addBooleanOption((o) => o.setName("enabled").setDescription("Включён ли фильтр").setRequired(true)))
    .addSubcommand((s) => s.setName("delete-flagged").setDescription("Выбрать удаление отмеченных сообщений.")
      .addBooleanOption((o) => o.setName("enabled").setDescription("Удалять отмеченные сообщения").setRequired(true))),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Команда доступна только на сервере.", flags: MessageFlags.Ephemeral });
    if (!canManage(interaction)) return interaction.reply({ content: "⛔ Нужны права администратора или «Управление сервером».", flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === "status") {
      const settings = automod.getSettings(interaction.guildId);
      const words = db.prepare("SELECT term FROM automod_terms WHERE guild_id=? ORDER BY term LIMIT 30").all(interaction.guildId);
      const exemptions = db.prepare("SELECT channel_id FROM automod_exempt_channels WHERE guild_id=? ORDER BY channel_id LIMIT 30").all(interaction.guildId);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🧹 Автоматическая модерация")
        .addFields(
          { name: "Функция", value: "Включается через /admin → Функции бота → Автоматическая модерация" },
          { name: "Лимит упоминаний", value: String(settings.mass_mention_limit), inline: true },
          { name: "Фильтр ссылок", value: settings.filter_links ? "Включён" : "Выключен", inline: true },
          { name: "Фильтр Discord-приглашений", value: settings.filter_invites ? "Включён" : "Выключен", inline: true },
          { name: "Удаление срабатываний", value: settings.delete_flagged ? "Включено" : "Только предупреждение", inline: true },
          { name: "Канал журнала", value: settings.log_channel_id ? `<#${settings.log_channel_id}>` : "Не настроен", inline: true },
          { name: "Запрещённые слова/фразы", value: words.length ? words.map((w) => `• ${w.term}`).join("\n").slice(0, 1000) : "Не настроены" },
          { name: "Каналы-исключения", value: exemptions.length ? exemptions.map((e) => `<#${e.channel_id}>`).join(", ").slice(0, 1000) : "Нет" },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === "log-channel") {
      const channel = interaction.options.getChannel("channel", true);
      if (!channel.isTextBased() || !channel.isSendable()) return interaction.reply({ content: "Выбери текстовый канал.", flags: MessageFlags.Ephemeral });
      const perms = channel.permissionsFor(await interaction.guild.members.fetchMe());
      if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: "У бота нет прав просмотра, отправки сообщений и встраивания ссылок в этот канал.", flags: MessageFlags.Ephemeral });
      }
      db.prepare("INSERT INTO automod_settings (guild_id, log_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET log_channel_id=excluded.log_channel_id, updated_at=CURRENT_TIMESTAMP").run(interaction.guildId, channel.id);
      audit(interaction, "automod_log_channel_set", channel.id);
      return interaction.reply({ content: `✅ Журнал автоматической модерации: ${channel}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "word-add" || sub === "word-remove") {
      const term = interaction.options.getString("term", true).trim().toLocaleLowerCase("ru-RU");
      if (!term || term.length < 2 || /[\n\r]/.test(term)) return interaction.reply({ content: "Укажи слово или фразу длиной от 2 символов без переносов строки.", flags: MessageFlags.Ephemeral });
      if (sub === "word-add") {
        db.prepare("INSERT OR IGNORE INTO automod_terms (guild_id, term, added_by) VALUES (?, ?, ?)").run(interaction.guildId, term, interaction.user.id);
      } else {
        db.prepare("DELETE FROM automod_terms WHERE guild_id=? AND term=?").run(interaction.guildId, term);
      }
      audit(interaction, sub === "word-add" ? "automod_term_added" : "automod_term_removed", term);
      return interaction.reply({ content: sub === "word-add" ? `✅ Добавлено в фильтр: **${term}**.` : `✅ Удалено из фильтра (если существовало): **${term}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "exempt-add" || sub === "exempt-remove") {
      const channel = interaction.options.getChannel("channel", true);
      if (sub === "exempt-add") {
        db.prepare("INSERT OR IGNORE INTO automod_exempt_channels (guild_id, channel_id, added_by) VALUES (?, ?, ?)").run(interaction.guildId, channel.id, interaction.user.id);
      } else {
        db.prepare("DELETE FROM automod_exempt_channels WHERE guild_id=? AND channel_id=?").run(interaction.guildId, channel.id);
      }
      audit(interaction, sub === "exempt-add" ? "automod_exemption_added" : "automod_exemption_removed", channel.id);
      return interaction.reply({ content: sub === "exempt-add" ? `✅ ${channel} исключён из автоматических фильтров.` : `✅ Исключение для ${channel} удалено.`, flags: MessageFlags.Ephemeral });
    }
    const settings = automod.getSettings(interaction.guildId);
    if (sub === "mentions-limit") {
      const count = interaction.options.getInteger("count", true);
      db.prepare("INSERT INTO automod_settings (guild_id, mass_mention_limit) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET mass_mention_limit=excluded.mass_mention_limit, updated_at=CURRENT_TIMESTAMP").run(interaction.guildId, count);
      audit(interaction, "automod_mentions_limit", String(count));
      return interaction.reply({ content: `✅ Лимит массовых упоминаний установлен: ${count}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "links") {
      const enabled = interaction.options.getBoolean("enabled", true);
      db.prepare("INSERT INTO automod_settings (guild_id, filter_links) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET filter_links=excluded.filter_links, updated_at=CURRENT_TIMESTAMP").run(interaction.guildId, enabled ? 1 : 0);
      audit(interaction, "automod_links_toggled", String(enabled));
      return interaction.reply({ content: `✅ Фильтр обычных ссылок ${enabled ? "включён" : "выключен"}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "delete-flagged") {
      const enabled = interaction.options.getBoolean("enabled", true);
      db.prepare("INSERT INTO automod_settings (guild_id, delete_flagged) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET delete_flagged=excluded.delete_flagged, updated_at=CURRENT_TIMESTAMP").run(interaction.guildId, enabled ? 1 : 0);
      audit(interaction, "automod_delete_toggled", String(enabled));
      return interaction.reply({ content: `✅ Отмеченные сообщения ${enabled ? "будут удаляться" : "будут только отмечаться предупреждением"}.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: "Неизвестная настройка.", flags: MessageFlags.Ephemeral });
  },
};
