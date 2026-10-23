const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("botinfo").setDescription("Показать информацию о боте."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕊 Дух Свободы | HeradeLegend")
      .setDescription("Твой помощник на сервере: порядок, поддержка и развитие сообщества. Функции подключаются поэтапно.")
      .addFields(
        { name: "Библиотека", value: "discord.js v14", inline: true },
        { name: "Среда", value: `Node.js ${process.versions.node}`, inline: true },
        { name: "Аптайм процесса", value: `${Math.floor(process.uptime())} сек.`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
