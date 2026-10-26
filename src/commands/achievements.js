const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { listAchievements } = require("../achievements");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("Посмотреть достижения участника.")
    .addUserOption((option) => option
      .setName("member")
      .setDescription("Чьи достижения посмотреть")
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Достижения доступны только на сервере.", flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: "Не удалось найти участника на этом сервере.", flags: MessageFlags.Ephemeral });
    }

    const items = listAchievements(interaction.guildId, user.id);
    const unlocked = items.filter((item) => item.unlocked);
    const locked = items.filter((item) => !item.unlocked);
    const lines = [
      ...unlocked.map((item) => `${item.emoji} **${item.name}** — ${item.description} · получено ${new Date(item.awardedAt).toLocaleDateString("ru-RU")}`),
      ...(locked.length ? ["", "**Ещё можно получить**", ...locked.map((item) => `🔒 ${item.name} — ${item.description}`)] : []),
    ];
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL({ size: 128 }) })
      .setTitle("🏅 Достижения HeradeLegend")
      .setDescription(lines.join("\n").slice(0, 4000) || "Пока достижений нет. Участвуй в жизни сервера, чтобы открыть первые награды.")
      .addFields({ name: "Прогресс коллекции", value: `**${unlocked.length} / ${items.length}** достижений открыто` })
      .setFooter({ text: "Достижения сохраняются в базе данных сервера." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
