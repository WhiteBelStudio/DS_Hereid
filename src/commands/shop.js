const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG } = require("../economy");
const { economyDisabled } = require("../economy-access");

const CATEGORY_LABELS = {
  Титулы: "🏷️ ТИТУЛЫ",
  Значки: "✨ ЗНАЧКИ",
  Рамки: "🖼️ БАННЕРЫ И РАМКИ",
  Цвета: "🎨 ЦВЕТА ПРОФИЛЯ",
};
const ITEM_STYLE = {
  frame_ocean: { emoji: "🌊", rarity: "ОБЫЧНЫЙ" },
  frame_forest: { emoji: "🌿", rarity: "ОБЫЧНЫЙ" },
  frame_sunset: { emoji: "🌅", rarity: "ОБЫЧНЫЙ" },
  frame_neon: { emoji: "💠", rarity: "РЕДКИЙ" },
  frame_ice: { emoji: "❄️", rarity: "РЕДКИЙ" },
  frame_shadow: { emoji: "🌑", rarity: "ЭПИЧЕСКИЙ" },
  frame_galaxy: { emoji: "🌌", rarity: "ЭПИЧЕСКИЙ" },
  frame_gold: { emoji: "👑", rarity: "ЛЕГЕНДАРНЫЙ" },
};
function itemLine(item) {
  const style = ITEM_STYLE[item.id] || {};
  const icon = style.emoji || (item.type === "title" ? "🏷️" : item.type === "badge" ? "✨" : item.type === "color" ? "🎨" : "🖼️");
  const rarity = style.rarity ? ` · ${style.rarity}` : "";
  return `${icon} **${item.name}**${rarity}\n└ ${item.price.toLocaleString("ru-RU")} 🪙 · ID: \`${item.id}\``;
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
        { name: "Значки", value: "Значки" },
        { name: "Баннеры и рамки", value: "Рамки" },
        { name: "Цвета", value: "Цвета" },
      )),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Магазин доступен только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (await economyDisabled(interaction)) return;

    const category = interaction.options.getString("категория") || "all";
    const items = CATALOG.filter((item) => category === "all" || item.category === category);
    const frames = items.filter((item) => item.category === "Рамки");
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
        `**Предметов в разделе:** ${items.length}`,
      ].join("\n"));

    if (category === "all") {
      for (const itemCategory of ["Рамки", "Титулы", "Значки", "Цвета"]) {
        const group = items.filter((item) => item.category === itemCategory);
        if (!group.length) continue;
        embed.addFields({
          name: CATEGORY_LABELS[itemCategory],
          value: group.map(itemLine).join("\n\n").slice(0, 1024),
          inline: false,
        });
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

    if (frames.length) {
      embed.addFields({
        name: "🖼️ КОЛЛЕКЦИЯ ОФОРМЛЕНИЯ",
        value: "🌊 Океан · 🌿 Лес · 🌅 Закат · 💠 Неон\n🌌 Галактика · 👑 Золото · ❄️ Лёд · 🌑 Тень\n\nКаждая тема имеет собственную палитру и уровень редкости.",
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
