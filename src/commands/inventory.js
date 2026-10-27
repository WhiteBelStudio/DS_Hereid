const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getInventory, getItemRarity, RARITY_ORDER } = require("../economy");
const { economyDisabled } = require("../economy-access");
module.exports = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("Посмотреть купленные предметы.")
    .addUserOption(o => o.setName("member").setDescription("Инвентарь участника").setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Инвентарь доступен только на сервере.", flags: MessageFlags.Ephemeral });
    if (await economyDisabled(interaction)) return;
    const user = interaction.options.getUser("member") || interaction.user;
    const items = getInventory(interaction.guildId, user.id).sort((a, b) => {
      const categoryOrder = ["Титулы", "Баннеры", "Значки", "Цвета"];
      const categoryDifference = categoryOrder.indexOf(a.item.category) - categoryOrder.indexOf(b.item.category);
      if (categoryDifference !== 0) return categoryDifference;
      const rarityDifference = RARITY_ORDER.indexOf(getItemRarity(a.item)) - RARITY_ORDER.indexOf(getItemRarity(b.item));
      return rarityDifference || a.item.price - b.item.price || a.item.name.localeCompare(b.item.name, "ru");
    });
    const description = items.length
      ? items.map((row) => `• **${row.item.name}** · ${getItemRarity(row.item)} · ${row.item.price.toLocaleString("ru-RU")} 🪙 — ID: \`${row.item.id}\``).join("\n")
      : "Инвентарь пуст. Загляни в /shop и забери /daily.";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🎒 Инвентарь — ${user.username}`).setDescription(description).setFooter({text:"Применение предмета: /equip item_id:<ID>"})], flags: MessageFlags.Ephemeral });
  },
};
