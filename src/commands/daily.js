const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { claimDaily } = require("../economy");
function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000), minutes = Math.ceil((ms % 3600000) / 60000);
  return hours ? `${hours} ч. ${minutes} мин.` : `${Math.max(1,minutes)} мин.`;
}
const { economyDisabled } = require("../economy-access");
module.exports = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Забрать ежедневную награду."),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Награды доступны только на сервере.", flags: MessageFlags.Ephemeral });
    if (await economyDisabled(interaction)) return;
    const result = claimDaily(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder().setColor(result.claimed ? 0x1ABC9C : 0xE67E22).setTitle(result.claimed ? "🎁 Ежедневная награда" : "⏳ Награда уже получена")
      .setDescription(result.claimed ? `Начислено **+${result.reward}** монет.\nБаланс: **${result.balance.toLocaleString("ru-RU")}** монет.` : `Следующую награду можно забрать через **${formatDuration(result.remainingMs)}**.\nБаланс: **${result.balance.toLocaleString("ru-RU")}** монет.`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
