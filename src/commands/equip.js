const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG, equipItem, removeEquipped, getCustomProfile } = require("../economy");
const { economyDisabled } = require("../economy-access");
module.exports = {
  data: new SlashCommandBuilder().setName("equip").setDescription("Применить купленный предмет к своему профилю.")
    .addStringOption(o => o.setName("item_id").setDescription("ID предмета из инвентаря").setRequired(false)
      .addChoices(...CATALOG.map(item => ({name:item.name,value:item.id}))))
    .addStringOption(o => o.setName("снять").setDescription("Снять оформление выбранного типа").setRequired(false)
      .addChoices({name:"Титул",value:"title"},{name:"Значок",value:"badge"},{name:"Рамку",value:"frame"},{name:"Цвет",value:"color"})),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({content:"Профили доступны только на сервере.",flags:MessageFlags.Ephemeral});
    if (await economyDisabled(interaction)) return;
    const itemId = interaction.options.getString("item_id");
    const removeType = interaction.options.getString("снять");
    if (itemId && removeType) return interaction.reply({content:"Укажи предмет или тип оформления для снятия, но не оба сразу.",flags:MessageFlags.Ephemeral});
    if (removeType) {
      removeEquipped(interaction.guildId,interaction.user.id,removeType);
      return interaction.reply({content:"Оформление снято.",flags:MessageFlags.Ephemeral});
    }
    if (!itemId) {
      const p = getCustomProfile(interaction.guildId,interaction.user.id);
      const summary = ["title","badge","frame","color"].map(type => `**${type}:** ${p[type]?.name || "не выбрано"}`).join("\n");
      return interaction.reply({content:`Текущее оформление профиля:\n${summary}`,flags:MessageFlags.Ephemeral});
    }
    const result = equipItem(interaction.guildId,interaction.user.id,itemId);
    const text = result.ok ? `Применён предмет **${result.item.name}**.` : result.reason === "not_owned" ? "Сначала купи этот предмет и проверь /inventory." : "Предмет не найден.";
    await interaction.reply({embeds:[new EmbedBuilder().setColor(result.ok ? 0x1ABC9C : 0xE74C3C).setDescription(text)],flags:MessageFlags.Ephemeral});
  },
};
