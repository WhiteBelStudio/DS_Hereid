const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG } = require("../economy");
const { economyDisabled } = require("../economy-access");

const CATEGORY_ORDER = ["Титулы", "Баннеры", "Значки", "Цвета"];
const CATEGORY_LABELS = {
  Титулы: "🏷️ ТИТУЛЫ",
  Баннеры: "🖼️ КАСТОМНЫЕ БАННЕРЫ",
  Значки: "✨ ЗНАЧКИ",
  Цвета: "🎨 ЦВЕТА ПРОФИЛЯ",
};
const CATEGORY_EMOJI = { Титулы: "🏷️", Баннеры: "🖼️", Значки: "✨", Цвета: "🎨" };
const BANNER_STYLE = {
  banner_ocean: { emoji: "🌊", rarity: "РЕДКИЙ" },
  banner_forest: { emoji: "🌿", rarity: "РЕДКИЙ" },
  banner_sunset: { emoji: "🌅", rarity: "ЭПИЧЕСКИЙ" },
  banner_neon: { emoji: "💠", rarity: "ЭПИЧЕСКИЙ" },
  banner_ice: { emoji: "❄️", rarity: "ЭПИЧЕСКИЙ" },
  banner_shadow: { emoji: "🌑", rarity: "ЛЕГЕНДАРНЫЙ" },
  banner_galaxy: { emoji: "🌌", rarity: "ЛЕГЕНДАРНЫЙ" },
  banner_gold: { emoji: "👑", rarity: "МИФИЧЕСКИЙ" },
};

function titleRarity(price) {
  if (price <= 500) return "ОБЫЧНЫЙ";
  if (price <= 1500) return "РЕДКИЙ";
  if (price <= 3000) return "ЭПИЧЕСКИЙ";
  if (price <= 5000) return "ЛЕГЕНДАРНЫЙ";
  return "МИФИЧЕСКИЙ";
}

function itemLine(item) {
  const bannerStyle = BANNER_STYLE[item.id];
  const rarity = bannerStyle?.rarity || (item.category === "Титулы" ? titleRarity(item.price) : "");
  const icon = bannerStyle?.emoji || CATEGORY_EMOJI[item.category] || "🛍️";
  const rarityLabel = rarity ? ` · ${rarity}` : "";
  return `${icon} **${item.name}**${rarityLabel}\n└ **${item.price.toLocaleString("ru-RU")}** 🪙 · ID: ${item.id}`;
}

function makeCategoryEmbed(category, categoryItems, totalCount) {
  const sortedItems = [...categoryItems].sort((a, b) =>
    a.price - b.price || a.name.localeCompare(b.name, "ru"),
  );
  const embed = new EmbedBuilder()
    .setColor(0x7C5CFC)
    .setTitle(`✦ HERADE SHOP · ${CATEGORY_LABELS[category] || category.toUpperCase()}`)
    .setDescription([
      "╭━━━━━━━━━━━━━━━━━━━━╮",
      "　**МАГАЗИН ПЕРСОНАЛИЗАЦИИ**",
      "　Собери стиль, который узнают с первого взгляда.",
      "╰━━━━━━━━━━━━━━━━━━━━╯",
      "",
      "🪙 Покупка навсегда · купленные предметы сохраняются в коллекции.",
      "🎒 /buy — купить · /equip — применить · /profile — посмотреть.",
      `**В этой категории:** ${sortedItems.length} · **Всего в магазине:** ${totalCount}`,
      category === "Титулы" ? "Редкость титулов указана рядом с названием; товары отсортированы по цене." : "Товары отсортированы по цене от меньшей к большей.",
    ].join("\n"))
    .setFooter({ text: "HeradeLegend Atelier · Твой профиль — твой стиль" });

  if (!sortedItems.length) {
    embed.addFields({ name: CATEGORY_LABELS[category] || category, value: "Пока здесь пусто — загляни позже." });
    return embed;
  }

  for (let i = 0; i < sortedItems.length; i += 5) {
    const chunk = sortedItems.slice(i, i + 5);
    embed.addFields({
      name: i === 0
        ? CATEGORY_LABELS[category] || category
        : `Продолжение · ${i + 1}–${i + chunk.length}`,
      value: chunk.map(itemLine).join("\n\n"),
      inline: false,
    });
  }
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Открыть магазин оформления профиля.")
    .addStringOption((option) => option
      .setName("категория")
      .setDescription("Выбери раздел магазина")
      .setRequired(false)
      .addChoices(
        { name: "Все предметы", value: "all" },
        { name: "Титулы", value: "Титулы" },
        { name: "Кастомные баннеры", value: "Баннеры" },
        { name: "Значки", value: "Значки" },
        { name: "Цвета", value: "Цвета" },
      )),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Магазин доступен только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (await economyDisabled(interaction)) return;

    const requestedCategory = interaction.options.getString("категория") || "all";
    const categories = requestedCategory === "all"
      ? CATEGORY_ORDER
      : CATEGORY_ORDER.filter((category) => category === requestedCategory);
    const totalCount = CATALOG.length;
    const embeds = categories.map((category) => makeCategoryEmbed(
      category,
      CATALOG.filter((item) => item.category === category),
      totalCount,
    ));

    if (!embeds.length) {
      return interaction.reply({ content: "Такой категории нет. Выбери раздел в команде /shop.", flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  },
};
