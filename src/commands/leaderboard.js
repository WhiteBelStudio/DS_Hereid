const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getLeaderboard } = require("../rank-system");

const RANK_EMOJI = {
  LEGEND: "👑", ELITE: "💎", MASTER: "🏆", VETERAN: "🔥",
  ACTIVE: "⚡", MEMBER: "🌟", GUEST: "🛡️", NEWBIE: "🌱",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Показать рейтинг участников по рангу и активности."),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Таблица лидеров доступна только на сервере.", flags: MessageFlags.Ephemeral });
    }

    const rows = getLeaderboard(interaction.guildId, 10);
    const lines = rows.map((row, index) => {
      const rank = String(row.current_rank || "NEWBIE").toUpperCase();
      const voiceHours = (Number(row.voice_seconds) / 3600).toFixed(1);
      return `**${index + 1}.** <@!${row.user_id}> — ${RANK_EMOJI[rank] || "🌱"} **${rank}**\n↳ ${row.message_count} сообщений · ${row.active_days} активных дней · ${voiceHours} ч. в голосе`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🏆 HeradeLegend — таблица лидеров")
      .setDescription(lines.length ? lines.join("\n\n") : "Пока нет статистики рангов. Активность начнёт учитываться после запуска обновлённой версии бота.")
      .setFooter({ text: "Рейтинг учитывает ранг, сообщения, активные дни и голосовую активность." });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
