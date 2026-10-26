const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG } = require("../economy");
const { economyDisabled } = require("../economy-access");

const CATEGORY_LABELS = {
  Титулы: "🏷️ Титулы",
  Значки: "✨ Значки",
  Рамки: "🖼️ Рамки",
  Цвета: "🎨 Цвета профиля",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Открыть магазин кастомизации профиля.")
    .addStringOption((option) => option
      .setName("категория")
      .setDescription("Выбери раздел магазина")
      .setRequired(false)
      .addChoices(
        { name: "Все предметы", value: "all" },
        { name: "Титулы", value: "Титулы" },
        { name: "Значки", value: "Значки" },
        { name: "Рамки", value: "Рамки" },
        { name: "Цвета", value: "Цвета" },
      )),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Магазин доступен только на сервере.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (await economyDisabled(interaction)) return;

    const category = interaction.options.getString("категория") || "all";
    const items = CATALOG.filter((item) => category === "all" || item.category === category);
    const embed = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle("🛍️ HERADELEGEND • МАГАЗИН СТИЛЯ")
      .setDescription([
        "Собери оформление, которое отражает твой стиль.",
        "Покупка постоянная: предмет останется в коллекции, даже если ты снимешь его.",
        "",
        `**В каталоге:** ${items.length} предметов`,
        "**Валюта:** 🪙 монеты",
      ].join("\n"));

    if (category === "all") {
      for (const itemCategory of ["Титулы", "Значки", "Рамки", "Цвета"]) {
        const group = items.filter((item) => item.category === itemCategory);
        if (!group.length) continue;
        embed.addFields({
          name: CATEGORY_LABELS[itemCategory],
          value: group.map((item) =>
            `• **${item.name}** — ${item.price.toLocaleString("ru-RU")} 🪙  ·  ${String.fromCharCode(96)}${item.id}${String.fromCharCode(96)}`,
          ).join("\n"),
          inline: false,
        });
      }
    } else {
      embed.addFields(items.map((item) => ({
        name: `${item.name} — ${item.price.toLocaleString("ru-RU")} 🪙`,
        value: `${item.description}\nID: ${String.fromCharCode(96)}${item.id}${String.fromCharCode(96)}`,
        inline: true,
      })));
      if (!items.length) embed.addFields({ name: CATEGORY_LABELS[category] || category, value: "В этой категории пока нет предметов." });
    }

    embed.addFields({
      name: "💡 Как купить и применить",
      value: "1. Выбери предмет и скопируй его ID.\n2. Введи /buy и укажи item_id.\n3. Примени покупку через /equip.\n4. Посмотри результат через /profile.",
      inline: false,
    }).setFooter({ text: "HeradeLegend • /daily — ежедневные монеты • /inventory — твоя коллекция" });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
