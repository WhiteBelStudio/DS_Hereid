const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG } = require("../economy");
module.exports = {
  data: new SlashCommandBuilder().setName("shop").setDescription("Открыть магазин кастомизации профиля.")
    .addStringOption(o => o.setName("категория").setDescription("Фильтр каталога").setRequired(false)
      .addChoices({name:"Все предметы",value:"all"},{name:"Титулы",value:"Титулы"},{name:"Значки",value:"Значки"},{name:"Рамки",value:"Рамки"},{name:"Цвета",value:"Цвета"})),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Магазин доступен только на сервере.", flags: MessageFlags.Ephemeral });
    const category = interaction.options.getString("категория") || "all";
    const items = CATALOG.filter(item => category === "all" || item.category === category);
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle("🛍️ Магазин кастомизации")
      .setDescription(items.map(item => `**${item.name}** — ${item.price.toLocaleString("ru-RU")} 🪙\n`+`Категория: ${item.category} • ID: \`${item.id}\`\n${item.description}`).join("\n\n"))
      .setFooter({text:"Покупка: /buy item_id:<ID> • Предметы приобретаются один раз"});
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
