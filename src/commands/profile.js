const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getProfile, levelForXp } = require("../member-profile");
const { getCustomProfile, getInventory } = require("../economy");

const FRAME_STYLE = {
  Океан: { emoji: "🌊", label: "Океан" },
  Лес: { emoji: "🌿", label: "Лес" },
  Закат: { emoji: "🌅", label: "Закат" },
  Неон: { emoji: "💠", label: "Неон" },
  Галактика: { emoji: "🌌", label: "Галактика" },
  Золото: { emoji: "👑", label: "Золото" },
  Лёд: { emoji: "❄️", label: "Лёд" },
  Тень: { emoji: "🌑", label: "Тень" },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Посмотреть красивый профиль и прогресс участника.")
    .addUserOption((option) => option
      .setName("member")
      .setDescription("Чей профиль посмотреть")
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Профили доступны только на сервере.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const profile = getProfile(interaction.guildId, user.id);
    const custom = getCustomProfile(interaction.guildId, user.id);
    const inventory = getInventory(interaction.guildId, user.id);

    const level = levelForXp(profile.xp);
    const next = 100 * (level + 1) ** 2;
    const base = 100 * level ** 2;
    const progress = Math.max(0, Number(profile.xp) - base);
    const needed = Math.max(1, next - base);
    const percent = Math.min(100, Math.floor((progress / needed) * 100));
    const filled = Math.min(12, Math.floor((progress / needed) * 12));
    const bar = "🟪".repeat(filled) + "⬛".repeat(12 - filled);
    const color = custom.color ? Number.parseInt(custom.color.value, 16) : 0x5865f2;
    const frame = custom.frame ? FRAME_STYLE[custom.frame.value] : null;
    const badge = custom.badge?.value || "🌱";
    const title = custom.title?.value || "Участник сообщества";
    const displayName = member?.displayName || user.globalName || user.username;
    const xp = Number(profile.xp || 0);
    const balance = Number(profile.balance || 0);

    const embed = new EmbedBuilder()
      .setColor(Number.isFinite(color) ? color : 0x5865f2)
      .setAuthor({
        name: `${badge} ${displayName}  •  HERADELEGEND`,
        iconURL: user.displayAvatarURL({ size: 128 }),
      })
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .setTitle(`${frame ? frame.emoji : "✨"}  ${title}`)
      .setDescription([
        member ? `👤 **Участник:** ${member}` : "⚪ **Статус:** не состоит на сервере",
        frame ? `🎨 **Тема профиля:** ${frame.emoji} ${frame.label}` : "🎨 **Тема профиля:** классическая",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        `**ПРОГРЕСС ДО УРОВНЯ ${level + 1}**`,
        `${bar} **${percent}%**`,
        `${progress.toLocaleString("ru-RU")} / ${needed.toLocaleString("ru-RU")} XP до следующего уровня`,
      ].join("\n"))
      .addFields(
        { name: "🏆 УРОВЕНЬ", value: `**${level}**`, inline: true },
        { name: "✨ ОПЫТ", value: `**${xp.toLocaleString("ru-RU")} XP**`, inline: true },
        { name: "🪙 БАЛАНС", value: `**${balance.toLocaleString("ru-RU")}**`, inline: true },
        {
          name: "🪄 МОЁ ОФОРМЛЕНИЕ",
          value: [
            `**Титул:** ${custom.title?.value || "—"}`,
            `**Значок:** ${custom.badge?.value || "—"}`,
            `**Рамка:** ${custom.frame?.value || "—"}`,
            `**Цвет:** ${custom.color?.name || "Стандартный"}`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🎒 КОЛЛЕКЦИЯ",
          value: [
            `Предметов собрано: **${inventory.length}**`,
            inventory.length ? "Меняй стиль когда захочешь." : "Собери свой уникальный стиль в магазине.",
          ].join("\n"),
          inline: true,
        },
        {
          name: "🛍️ КАК ИЗМЕНИТЬ СТИЛЬ",
          value: "Покупай предметы в **/shop**, смотри коллекцию в **/inventory**, применяй через **/equip**.",
          inline: false,
        },
      )
      .setFooter({ text: "HeradeLegend • Твой профиль, твой стиль" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
