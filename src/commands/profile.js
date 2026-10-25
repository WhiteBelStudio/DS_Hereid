const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getProfile, levelForXp } = require("../member-profile");
const { getCustomProfile } = require("../economy");
module.exports = {
  data: new SlashCommandBuilder().setName("profile").setDescription("Посмотреть профиль и прогресс участника.").addUserOption((option) => option.setName("member").setDescription("Чей профиль посмотреть").setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Профили доступны только на сервере.", flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const profile = getProfile(interaction.guildId, user.id);
    const custom = getCustomProfile(interaction.guildId, user.id);
    const level = levelForXp(profile.xp), next = 100 * (level + 1) ** 2, base = 100 * level ** 2;
    const progress = Math.max(0, profile.xp - base), needed = Math.max(1, next - base);
    const filled = Math.min(10, Math.floor(progress / needed * 10));
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    const color = custom.color ? Number.parseInt(custom.color.value, 16) : 0x5865f2;
    const customization = [
      `**Титул:** ${custom.title?.value || "не выбран"}`,
      `**Значок:** ${custom.badge?.value || "не выбран"}`,
      `**Рамка:** ${custom.frame?.value || "не выбрана"}`,
    ].join("\n");
    const embed = new EmbedBuilder().setColor(color).setTitle(`${custom.badge ? custom.badge.value + " " : ""}👤 Профиль участника`).setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setDescription(`${member ? member.toString() : `Пользователь ${user.tag} не состоит на сервере.`}\n${custom.title ? `**${custom.title.value}**\n` : ""}${custom.frame ? `🖼️ Рамка: **${custom.frame.value}**` : ""}`)
      .addFields(
        { name: "Уровень", value: String(level), inline: true },
        { name: "Опыт (XP)", value: String(profile.xp), inline: true },
        { name: "Баланс", value: `${Number(profile.balance).toLocaleString("ru-RU")} 🪙`, inline: true },
        { name: "Прогресс до следующего уровня", value: `${bar} ${progress}/${needed} XP`, inline: false },
        { name: "Кастомизация", value: customization, inline: false },
      )
      .setFooter({ text: "HeradeLegend • Магазин: /shop • Оформление: /equip" });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
