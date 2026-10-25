const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getProfile, levelForXp } = require("../member-profile");
module.exports = {
  data: new SlashCommandBuilder().setName("profile").setDescription("Посмотреть профиль и прогресс участника.").addUserOption((option) => option.setName("участник").setDescription("Чей профиль посмотреть").setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Профили доступны только на сервере.", ephemeral: true });
    const user = interaction.options.getUser("участник") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const profile = getProfile(interaction.guildId, user.id);
    const level = levelForXp(profile.xp), next = 100 * (level + 1) ** 2, base = 100 * level ** 2;
    const progress = Math.max(0, profile.xp - base), needed = Math.max(1, next - base);
    const filled = Math.min(10, Math.floor(progress / needed * 10));
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("👤 Профиль участника").setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setDescription(member ? member.toString() : `Пользователь ${user.tag} не состоит на сервере.`)
      .addFields({ name: "Уровень", value: String(level), inline: true }, { name: "Опыт (XP)", value: String(profile.xp), inline: true }, { name: "Баланс", value: String(profile.balance), inline: true }, { name: "Прогресс до следующего уровня", value: `${bar} ${progress}/${needed} XP`, inline: false })
      .setFooter({ text: "HeradeLegend • XP начисляется за активность с кулдауном" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
