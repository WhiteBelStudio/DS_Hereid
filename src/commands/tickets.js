const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const tickets = require("../tickets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Просмотр тикетов поддержки (только персонал).")
    .addBooleanOption((option) => option
      .setName("history")
      .setDescription("Показать также закрытые обращения.")
      .setRequired(false)),
  async execute(interaction) {
    await tickets.listTickets(interaction, interaction.options.getBoolean("history") || false);
  },
};
