const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Показать доступные команды."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕊 Дух Свободы — команды")
      .setDescription([
        "**Основные команды**",
        "`/help` — список команд",
        "`/ping` — проверка отклика",
        "`/botinfo` — информация о боте",
        "`/admin` — интерактивная административная панель (нужны права)",
        "",
        "**Настройки сервера** (нужно право «Управление сервером»)",
        "`/serverconfig status` — показать текущие настройки",
        "`/serverconfig welcome-channel` — канал приветствий",
        "`/serverconfig welcome-message` — текст приветствия",
        "`/serverconfig goodbye-channel` — канал сообщений об уходе",
        "`/serverconfig goodbye-message` — текст сообщения об уходе",
        "`/serverconfig autorole` — роль новым участникам",
        "`/serverconfig mod-log-channel` — канал журнала модерации",
        "`/serverconfig reset-welcome` — отключить приветствия",
        "`/serverconfig reset-goodbye` — отключить сообщения об уходе",
        "`/serverconfig reset-autorole` — отключить автовыдачу роли",
        "`/serverconfig reset-mod-log` — сбросить канал журнала",
        "",
        "В текстах приветствия и прощания доступны переменные `{user}` и `{server}`.",
        "В панели доступны: участники, XP, модерация, роли доступа, настройки, статистика и аудит.",
      ].join("\n"))
      .setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
