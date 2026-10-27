const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG, RARITY_ORDER, getItemRarity } = require("../economy");
const { economyDisabled } = require("../economy-access");

const CATEGORY_LABELS = {
  Титулы: "🏷️ ТИТУЛЫ",
  Значки: "✨ ЗНАЧКИ",
  Баннеры: "🖼️ КАСТОМНЫЕ БАННЕРЫ",
  Цвета: "🎨 ЦВЕТА ПРОФИЛЯ",
};
const ITEM_STYLE = {
  title_joker: { emoji: "🃏" },
  title_gamer: { emoji: "🎮" },
  title_wanderer: { emoji: "🐾" },
  title_spark: { emoji: "⚡" },
  title_moonlit: { emoji: "🌙" },
  title_fox: { emoji: "🦊" },
  title_enigma: { emoji: "🎭" },
  title_iceborn: { emoji: "🧊" },
  title_eagle: { emoji: "🦅" },
  title_diamond: { emoji: "💎" },
  title_cosmic_wanderer: { emoji: "🌌" },
  title_sharpshooter: { emoji: "🎯" },
  title_observer: { emoji: "👁️" },
  title_warrior: { emoji: "⚔️" },
  title_dark_mage: { emoji: "🦇" },
  title_stellar: { emoji: "🌠" },
  title_dragon: { emoji: "🐉" },
  title_overlord: { emoji: "🔮" },
  title_dimension_keeper: { emoji: "🪬" },
  title_emperor: { emoji: "👑" },
  title_abyss_lord: { emoji: "🌑" },
  title_freedom_spirit: { emoji: "🕊️" },
  title_absolute: { emoji: "♛" },
  title_heavenly_archon: { emoji: "🪽" },
  title_beyond_reality: { emoji: "🪐" },
  title_absolute_legend: { emoji: "💠" },
  title_world_creator: { emoji: "🌌" },
  banner_ocean: { emoji: "🌊" },
  banner_forest: { emoji: "🌿" },
  banner_sunset: { emoji: "🌅" },
  banner_neon: { emoji: "💠" },
  banner_ice: { emoji: "❄️" },
  banner_shadow: { emoji: "🌑" },
  banner_galaxy: { emoji: "🌌" },
  banner_gold: { emoji: "👑" },
};
function sortCatalogItems(items) {
  const categoryOrder = ["Титулы", "Баннеры", "Значки", "Цвета"];
  return [...items].sort((a, b) => {
    const categoryDifference = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDifference !== 0) return categoryDifference;
    const rarityDifference = RARITY_ORDER.indexOf(getItemRarity(a)) - RARITY_ORDER.indexOf(getItemRarity(b));
    if (rarityDifference !== 0) return rarityDifference;
    return a.price - b.price || a.name.localeCompare(b.name, "ru");
  });
}
function itemLine(item) {
  const style = ITEM_STYLE[item.id] || {};
  const icon = style.emoji || (item.type === "title" ? "🏷️" : item.type === "badge" ? "✨" : item.type === "color" ? "🎨" : "🖼️");
  const rarity = getItemRarity(item);
  return `${icon} **${item.name}** · ${rarity.toLocaleUpperCase("ru-RU")}\n└ ${item.price.toLocaleString("ru-RU")} 🪙 · ID: \`${item.id}\``;
}

module.exports = {
  sortCatalogItems,
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
        { name: "Значки", value: "Значки" },
        { name: "Кастомные баннеры", value: "Баннеры" },
        { name: "Цвета", value: "Цвета" },
      ))
    .addStringOption((option) => option
      .setName("редкость")
      .setDescription("Показать предметы выбранной редкости")
      .setRequired(false)
      .addChoices(
        { name: "Обычные", value: "Обычный" },
        { name: "Редкие", value: "Редкий" },
        { name: "Эпические", value: "Эпический" },
        { name: "Легендарные", value: "Легендарный" },
        { name: "Мифические", value: "Мифический" },
      )),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Магазин доступен только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (await economyDisabled(interaction)) return;

    const category = interaction.options.getString("категория") || "all";
    const rarityFilter = interaction.options.getString("редкость");
    const filtered = CATALOG.filter((item) =>
      (category === "all" || item.category === category) &&
      (!rarityFilter || getItemRarity(item) === rarityFilter));
    const items = sortCatalogItems(filtered);
    const banners = items.filter((item) => item.category === "Баннеры");
    const embed = new EmbedBuilder()
      .setColor(0x7C5CFC)
      .setTitle("✦ HERADELEGEND · ATELIER")
      .setDescription([
        "╭━━━━━━━━━━━━━━━━━━━━╮",
        "　**МАГАЗИН ПЕРСОНАЛИЗАЦИИ**",
        "　Собери стиль, который узнают с первого взгляда.",
        "╰━━━━━━━━━━━━━━━━━━━━╯",
        "",
        "🪙 **Покупка навсегда** · предмет останется в коллекции.",
        "🎒 Купи предмет → примени через `/equip` → посмотри в `/profile`.",
        rarityFilter ? `**Редкость:** ${rarityFilter}` : null,
        `**Предметов в разделе:** ${items.length}`,
      ].filter(Boolean).join("\n"));

    if (category === "all") {
      for (const itemCategory of ["Титулы", "Баннеры", "Значки", "Цвета"]) {
        const group = items.filter((item) => item.category === itemCategory);
        if (!group.length) continue;
        for (let i = 0; i < group.length; i += 5) {
          const chunk = group.slice(i, i + 5);
          embed.addFields({
            name: i === 0 ? CATEGORY_LABELS[itemCategory] : `Продолжение · ${CATEGORY_LABELS[itemCategory]} · ${i + 1}–${i + chunk.length}`,
            value: chunk.map(itemLine).join("\n\n"),
            inline: false,
          });
        }
      }
    } else if (items.length) {
      for (let i = 0; i < items.length; i += 5) {
        const group = items.slice(i, i + 5);
        embed.addFields({
          name: i === 0 ? CATEGORY_LABELS[category] || category : `Продолжение · ${i + 1}–${i + group.length}`,
          value: group.map(itemLine).join("\n\n").slice(0, 1024),
          inline: false,
        });
      }
    } else {
      embed.addFields({ name: CATEGORY_LABELS[category] || category, value: "Пока здесь пусто — загляни позже." });
    }

    if (banners.length) {
      embed.addFields({
        name: "🖼️ КОЛЛЕКЦИЯ ОФОРМЛЕНИЯ",
        value: "🌊 Бездна океана · 🌿 Изумрудная чаща · 🌅 Последний закат · 💠 Неоновый импульс\n❄️ Кристальный шторм · 🌌 Рождение галактики · 🌑 Тихая тень · 👑 Золотая династия\n\nКаждый баннер меняет всю атмосферу карточки профиля.",
        inline: false,
      });
    }
    embed.addFields({
      name: "🛒 КАК ЗАБРАТЬ ПРЕДМЕТ",
      value: "1. Скопируй ID из каталога.\n2. Используй `/buy item_id:<ID>`.\n3. Активируй через `/equip item_id:<ID>`.\n4. Проверь результат командой `/profile`.\n\n`/inventory` — твоя личная коллекция · `/daily` — ежедневные монеты.",
      inline: false,
    }).setFooter({ text: "HeradeLegend Atelier · Твой профиль — твой стиль" });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
