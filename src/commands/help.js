const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Показать доступные команды."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕊 Дух Свободы — команды")
      .setDescription([
        "`/help` — список команд",
        "`/ping` — проверка отклика",
        "`/botinfo` — информация о боте",
        "",
        "**Настройки сервера** (нужно право «Управление сервером»):",
        "`/serverconfig welcome-channel` — канал приветствий",
        "`/serverconfig welcome-message` — текст приветствия",
        "`/serverconfig goodbye-channel` — канал сообщений об уходе",
        "`/serverconfig goodbye-message` — текст сообщения об уходе",
        "`/serverconfig autorole` — роль новым участникам",
        "`/serverconfig mod-log-channel` — канал журнала модерации",
        "",
        "В текстах доступны переменные `{user}` и `{server}`.",
      ].join("\n"))
      .setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed] });
  },
};
