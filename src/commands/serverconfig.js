const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const db = require("../database");

const SETTING_COLUMNS = new Set([
  "welcome_channel_id",
  "welcome_message",
  "goodbye_channel_id",
  "goodbye_message",
  "autorole_id",
  "mod_log_channel_id",
]);

function saveSetting(guildId, column, value) {
  if (!SETTING_COLUMNS.has(column)) throw new Error("Unsupported guild setting.");
  db.prepare(`
    INSERT INTO guild_settings (guild_id, ${column})
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      ${column} = excluded.${column},
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId, value);
}

function clearSetting(guildId, column) {
  if (!SETTING_COLUMNS.has(column)) throw new Error("Unsupported guild setting.");
  db.prepare(`
    INSERT INTO guild_settings (guild_id, ${column})
    VALUES (?, NULL)
    ON CONFLICT(guild_id) DO UPDATE SET
      ${column} = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId);
}

function getSettings(guildId) {
  return db.prepare(`
    SELECT welcome_channel_id, welcome_message, goodbye_channel_id,
           goodbye_message, autorole_id, mod_log_channel_id, updated_at
    FROM guild_settings WHERE guild_id = ?
  `).get(guildId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverconfig")
    .setDescription("Настройки приветствий, ролей и журнала сервера.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("status").setDescription("Показать текущие настройки сервера."))
    .addSubcommand((s) => s.setName("welcome-channel").setDescription("Установить канал приветствий.")
      .addChannelOption((o) => o.setName("channel").setDescription("Текстовый канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((s) => s.setName("welcome-message").setDescription("Установить текст приветствия.")
      .addStringOption((o) => o.setName("message").setDescription("Переменные: {user}, {server}").setMaxLength(1800).setRequired(true)))
    .addSubcommand((s) => s.setName("goodbye-channel").setDescription("Установить канал сообщений об уходе.")
      .addChannelOption((o) => o.setName("channel").setDescription("Текстовый канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((s) => s.setName("goodbye-message").setDescription("Установить текст сообщения об уходе.")
      .addStringOption((o) => o.setName("message").setDescription("Переменные: {user}, {server}").setMaxLength(1800).setRequired(true)))
    .addSubcommand((s) => s.setName("autorole").setDescription("Назначать роль новым участникам.")
      .addRoleOption((o) => o.setName("role").setDescription("Роль для новых участников").setRequired(true)))
    .addSubcommand((s) => s.setName("mod-log-channel").setDescription("Установить канал журнала модерации.")
      .addChannelOption((o) => o.setName("channel").setDescription("Текстовый канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((s) => s.setName("reset-welcome").setDescription("Отключить приветствия и сбросить их текст."))
    .addSubcommand((s) => s.setName("reset-goodbye").setDescription("Отключить сообщения об уходе и сбросить текст."))
    .addSubcommand((s) => s.setName("reset-autorole").setDescription("Отключить автоматическую выдачу роли."))
    .addSubcommand((s) => s.setName("reset-mod-log").setDescription("Очистить канал журнала модерации.")),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Эта команда работает только на сервере Discord.", flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Для настройки сервера нужно право «Управление сервером».", flags: MessageFlags.Ephemeral });
    }

    const subcommand = interaction.options.getSubcommand();
    try {
      if (subcommand === "status") {
        const row = getSettings(interaction.guildId);
        const value = (v) => v || "Не настроено";
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚙️ Настройки сервера")
          .addFields(
            { name: "Канал приветствий", value: row?.welcome_channel_id ? `<#${row.welcome_channel_id}>` : "Не настроено", inline: true },
            { name: "Текст приветствия", value: value(row?.welcome_message), inline: true },
            { name: "Канал сообщений об уходе", value: row?.goodbye_channel_id ? `<#${row.goodbye_channel_id}>` : "Не настроено", inline: true },
            { name: "Текст сообщения об уходе", value: value(row?.goodbye_message), inline: true },
            { name: "Автоматическая роль", value: row?.autorole_id ? `<@&${row.autorole_id}>` : "Не настроено", inline: true },
            { name: "Канал журнала модерации", value: row?.mod_log_channel_id ? `<#${row.mod_log_channel_id}>` : "Не настроено", inline: true },
          )
          .setFooter({ text: "Переменные в сообщениях: {user} и {server}" });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const actions = {
        "welcome-channel": {
          column: "welcome_channel_id",
          value: () => interaction.options.getChannel("channel").id,
          reply: (v) => `✅ Канал приветствий установлен: <#${v}>.`,
        },
        "welcome-message": {
          column: "welcome_message",
          value: () => interaction.options.getString("message").trim(),
          reply: () => "✅ Текст приветствия сохранён.",
        },
        "goodbye-channel": {
          column: "goodbye_channel_id",
          value: () => interaction.options.getChannel("channel").id,
          reply: (v) => `✅ Канал сообщений об уходе установлен: <#${v}>.`,
        },
        "goodbye-message": {
          column: "goodbye_message",
          value: () => interaction.options.getString("message").trim(),
          reply: () => "✅ Текст сообщения об уходе сохранён.",
        },
        autorole: {
          column: "autorole_id",
          value: () => interaction.options.getRole("role").id,
          reply: (v) => `✅ Автоматическая роль установлена: <@&${v}>. Убедись, что роль бота находится выше этой роли.`,
        },
        "mod-log-channel": {
          column: "mod_log_channel_id",
          value: () => interaction.options.getChannel("channel").id,
          reply: (v) => `✅ Канал журнала модерации установлен: <#${v}>.`,
        },
      };

      const resets = {
        "reset-welcome": ["welcome_channel_id", "welcome_message", "✅ Приветствия отключены, текст сброшен."],
        "reset-goodbye": ["goodbye_channel_id", "goodbye_message", "✅ Сообщения об уходе отключены, текст сброшен."],
        "reset-autorole": ["autorole_id", null, "✅ Автоматическая выдача роли отключена."],
        "reset-mod-log": ["mod_log_channel_id", null, "✅ Канал журнала модерации очищен."],
      };

      if (resets[subcommand]) {
        const [first, second, message] = resets[subcommand];
        clearSetting(interaction.guildId, first);
        if (second) clearSetting(interaction.guildId, second);
        return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }

      const action = actions[subcommand];
      if (!action) {
        return interaction.reply({ content: "Неизвестная настройка.", flags: MessageFlags.Ephemeral });
      }

      const value = action.value();
      if (typeof value === "string" && !value.trim()) {
        return interaction.reply({ content: "Текст не может быть пустым.", flags: MessageFlags.Ephemeral });
      }
      if (subcommand === "autorole") {
        const role = interaction.options.getRole("role");
        if (role.id === interaction.guildId) {
          return interaction.reply({ content: "Нельзя назначить роль @everyone как автоматическую.", flags: MessageFlags.Ephemeral });
        }
        if (role.managed || !role.editable) {
          return interaction.reply({ content: "Бот не может выдавать эту роль. Проверь иерархию ролей и настройки интеграций.", flags: MessageFlags.Ephemeral });
        }
      }

      saveSetting(interaction.guildId, action.column, value);
      return interaction.reply({ content: action.reply(value), flags: MessageFlags.Ephemeral });
    } catch (error) {
      interaction.client.logger?.error?.("Could not apply server configuration.", error);
      return interaction.reply({
        content: "⚠️ Не удалось сохранить настройку. Проверь права бота и журнал запуска.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
