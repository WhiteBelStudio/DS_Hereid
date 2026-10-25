const { isFeatureEnabled } = require("./features");
async function economyDisabled(interaction) {
  if (isFeatureEnabled(interaction.guildId, "economy")) return false;
  await interaction.reply({ content: "Экономика временно отключена администрацией сервера.", ephemeral: true });
  return true;
}
module.exports = { economyDisabled };
