const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getBalance } = require("../economy");
const { economyDisabled } = require("../economy-access");
module.exports = {
  data: new SlashCommandBuilder().setName("balance").setDescription("Посмотреть баланс валюты сервера.")
    .addUserOption(o => o.setName("member").setDescription("Баланс участника").setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Экономика доступна только на сервере.", flags: MessageFlags.Ephemeral });
    if (await economyDisabled(interaction)) return;
    const user = interaction.options.getUser("member") || interaction.user;
    const result = getBalance(interaction.guildId, user.id);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1ABC9C).setTitle("🪙 Баланс").setDescription(`**${user.username}**: **${result.balance.toLocaleString("ru-RU")}** монет`)], flags: MessageFlags.Ephemeral });
  },
};
