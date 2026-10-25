const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { CATALOG, buyItem } = require("../economy");
const { economyDisabled } = require("../economy-access");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Купить предмет в магазине.")
    .addStringOption((option) => option
      .setName("item_id")
      .setDescription("ID предмета из /shop")
      .setRequired(true)
      .addChoices(...CATALOG.map((item) => ({
        name: `${item.name} — ${item.price} монет`,
        value: item.id,
      })))),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Покупки доступны только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (await economyDisabled(interaction)) return;

    const result = buyItem(interaction.guildId, interaction.user.id, interaction.options.getString("item_id"));
    const messages = {
      already_owned: "Этот предмет уже есть в твоём инвентаре.",
      insufficient_funds: "Недостаточно монет для покупки.",
      unknown_item: "Такого предмета нет в каталоге.",
    };
    const description = result.ok
      ? `Куплено: **${result.item.name}** за **${result.item.price}** монет.\nОстаток: **${result.balance.toLocaleString("ru-RU")}** монет.\n\nПрименить предмет можно командой /equip с его ID.`
      : `${messages[result.reason] || "Покупка не выполнена."}${result.balance !== undefined ? `\nБаланс: **${result.balance.toLocaleString("ru-RU")}** монет.` : ""}`;
    const embed = new EmbedBuilder()
      .setColor(result.ok ? 0x1ABC9C : 0xE74C3C)
      .setTitle(result.ok ? "✅ Покупка успешна" : "❌ Не удалось купить")
      .setDescription(description);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
