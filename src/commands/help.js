const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Показать доступные команды."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📚 Команды бота")
      .setDescription([
        "`/help` — список команд",
        "`/ping` — проверка отклика",
        "`/botinfo` — информация о боте",
      ].join("\n"))
      .setFooter({ text: "Новые команды будут добавляться по мере реализации модулей." });
    await interaction.reply({ embeds: [embed] });
  },
};
