const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getInventory } = require("../economy");
const { economyDisabled } = require("../economy-access");
module.exports = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("Посмотреть купленные предметы.")
    .addUserOption(o => o.setName("member").setDescription("Инвентарь участника").setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Инвентарь доступен только на сервере.", flags: MessageFlags.Ephemeral });
    if (await economyDisabled(interaction)) return;
    const user = interaction.options.getUser("member") || interaction.user;
    const items = getInventory(interaction.guildId,user.id);
    const description = items.length ? items.map(row => `• **${row.item.name}** — ID: \`${row.item.id}\``).join("\n") : "Инвентарь пуст. Загляни в /shop и забери /daily.";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🎒 Инвентарь — ${user.username}`).setDescription(description).setFooter({text:"Применение предмета: /equip item_id:<ID>"})], flags: MessageFlags.Ephemeral });
  },
};
