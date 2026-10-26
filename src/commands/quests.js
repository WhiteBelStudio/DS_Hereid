const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { DAILY_QUESTS, getDailyQuests } = require("../economy");
const { economyDisabled } = require("../economy-access");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quests")
    .setDescription("Посмотреть ежедневные задания и награды."),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Ежедневные задания доступны только на сервере.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (await economyDisabled(interaction)) return;

    const quests = getDailyQuests(interaction.guildId, interaction.user.id);
    const lines = quests.map((quest) => {
      const progress = quest.completed
        ? "✅ Выполнено"
        : `🔄 ${quest.progress}/${quest.target}`;
      return [
        `**${quest.name}** — ${progress}`,
        quest.description,
        `Награда: **${quest.reward} 🪙**`,
      ].join("\n");
    });

    const completed = quests.filter((quest) => quest.completed).length;
    const embed = new EmbedBuilder()
      .setColor(0x1ABC9C)
      .setTitle("📜 Ежедневные задания")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `Выполнено: ${completed}/${DAILY_QUESTS.length} • Сброс в полночь по Москве • Награда начисляется автоматически` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
