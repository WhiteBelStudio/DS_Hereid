const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const db = require("../database");

function saveSetting(guildId, column, value) {
  const allowedColumns = new Set([
    "welcome_channel_id",
    "welcome_message",
    "goodbye_channel_id",
    "goodbye_message",
    "autorole_id",
    "mod_log_channel_id",
  ]);
  if (!allowedColumns.has(column)) throw new Error("Unsupported guild setting.");
  db.prepare(`
    INSERT INTO guild_settings (guild_id, ${column})
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      ${column} = excluded.${column},
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId, value);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverconfig")
    .setDescription("Настройки приветствий, ролей и журнала сервера.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName("welcome-channel")
      .setDescription("Установить канал приветствий.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("Текстовый канал для приветствий")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("welcome-message")
      .setDescription("Установить текст приветствия.")
      .addStringOption((option) => option
        .setName("message")
        .setDescription("Поддерживаются {user} и {server}")
        .setMaxLength(1800)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("goodbye-channel")
      .setDescription("Установить канал сообщений об уходе.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("Текстовый канал")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("goodbye-message")
      .setDescription("Установить текст сообщения об уходе.")
      .addStringOption((option) => option
        .setName("message")
        .setDescription("Поддерживаются {user} и {server}")
        .setMaxLength(1800)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("autorole")
      .setDescription("Назначать роль новым участникам.")
      .addRoleOption((option) => option
        .setName("role")
        .setDescription("Роль для новых участников")
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("mod-log-channel")
      .setDescription("Установить канал журнала модерации.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("Текстовый канал для журнала")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Эта команда работает только на сервере Discord.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const settings = {
      "welcome-channel": {
        column: "welcome_channel_id",
        value: () => interaction.options.getChannel("channel").id,
        reply: () => `✅ Канал приветствий установлен: <#${interaction.options.getChannel("channel").id}>`,
      },
      "welcome-message": {
        column: "welcome_message",
        value: () => interaction.options.getString("message"),
        reply: () => "✅ Текст приветствия сохранён. Переменные: {user} и {server}.",
      },
      "goodbye-channel": {
        column: "goodbye_channel_id",
        value: () => interaction.options.getChannel("channel").id,
        reply: () => `✅ Канал сообщений об уходе установлен: <#${interaction.options.getChannel("channel").id}>`,
      },
      "goodbye-message": {
        column: "goodbye_message",
        value: () => interaction.options.getString("message"),
        reply: () => "✅ Текст сообщения об уходе сохранён. Переменные: {user} и {server}.",
      },
      autorole: {
        column: "autorole_id",
        value: () => interaction.options.getRole("role").id,
        reply: () => `✅ Роль для новых участников установлена: <@&${interaction.options.getRole("role").id}>. Проверь, что роль бота выше неё в иерархии ролей.`,
      },
      "mod-log-channel": {
        column: "mod_log_channel_id",
        value: () => interaction.options.getChannel("channel").id,
        reply: () => `✅ Канал журнала модерации установлен: <#${interaction.options.getChannel("channel").id}>.`,
      },
    };

    const setting = settings[subcommand];
    if (!setting) {
      return interaction.reply({
        content: "Неизвестная настройка.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      saveSetting(interaction.guildId, setting.column, setting.value());
      await interaction.reply({
        content: setting.reply(),
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      interaction.client.logger?.error?.("Could not save server settings.", error);
      await interaction.reply({
        content: "⚠️ Не удалось сохранить настройку. Проверь журнал бота.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
