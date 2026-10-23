const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Проверить, отвечает ли бот."),
  async execute(interaction) {
    await interaction.reply({
      content: `🏓 Pong! Задержка Discord API: ${Math.round(interaction.client.ws.ping)} мс.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
