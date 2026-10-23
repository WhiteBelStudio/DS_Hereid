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
      ].join("\n"))
      .setFooter({ text: "HeradeLegend • новые команды подключаются по мере развития проекта." });
    await interaction.reply({ embeds: [embed] });
  },
};
