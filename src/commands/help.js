const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Список обычных команд HeradeLegend."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕊 HeradeLegend — команды участника")
      .setDescription([
        "Здесь показаны команды для обычных участников. Административные команды в этой справке не отображаются.",
        "",
        "`/help` — краткий список обычных команд.",
        "`/commandrules` — подробная справка: как работают команды и какие правила действуют.",
        "`/ping` — проверить отклик бота.",
        "`/botinfo` — посмотреть информацию о боте и время работы процесса.",
        "`/profile` — посмотреть свой уровень, XP, баланс и прогресс до следующего уровня.",
        "`/profile member:@участник` — посмотреть профиль другого участника сервера."
      ].join("\n"))
      .setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
